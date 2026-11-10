/**
 * Layout changes made during a visit (moves, swaps, pulls, new products),
 * applied to a planogram's slots. Pure: violations are returned, never
 * thrown, as in `slotRuleViolation`. Verbs: `docs/diagrams/visit-layout-changes.md`.
 */

import type { VisitLine } from "../visits/types.ts";
import { slotProductKey } from "./mixedSlots.ts";

/** Par is ignored in this operation; every new entry carries this placeholder. */
export const PLACEHOLDER_PAR = 10;

export type LayoutChange =
  | { kind: "move"; productId: string; fromSlotCode: string; toSlotCode: string }
  | { kind: "remove"; slotCode: string; productId: string }
  | { kind: "add"; slotCode: string; productId: string }
  | { kind: "set-price"; slotCode: string; priceCents: number };

export interface LayoutSlot {
  slotCode: string;
  productId: string;
  par: number;
  priceCents: number;
}

export type LayoutChangeViolation =
  | { kind: "product-not-in-slot"; slotCode: string; productId: string }
  | { kind: "product-already-in-slot"; slotCode: string; productId: string }
  | { kind: "missing-price"; slotCode: string }
  | { kind: "move-to-same-slot"; slotCode: string };

interface WorkingEntry {
  slotCode: string;
  productId: string;
  par: number;
  priceCents: number | undefined;
}

const isEntry = (slotCode: string, productId: string) => (entry: WorkingEntry) =>
  entry.slotCode === slotCode && entry.productId === productId;

/**
 * The slots after applying the changes in list order, or the first violation.
 * Prices come from the original slots, not the running ones, so a swap gives
 * each product the other slot's old price.
 */
export const slotsAfterChanges = (
  slots: readonly LayoutSlot[],
  changes: readonly LayoutChange[],
): { slots: LayoutSlot[] } | { violation: LayoutChangeViolation } => {
  const originalPriceBySlot = new Map<string, number>();
  for (const slot of slots) {
    originalPriceBySlot.set(slot.slotCode, slot.priceCents);
  }
  const priceOverrideBySlot = new Map<string, number>();
  let working: WorkingEntry[] = slots.map((slot) => ({ ...slot }));

  for (const change of changes) {
    if (change.kind === "set-price") {
      priceOverrideBySlot.set(change.slotCode, change.priceCents);
      continue;
    }

    if (change.kind === "add") {
      if (working.some(isEntry(change.slotCode, change.productId))) {
        return {
          violation: {
            kind: "product-already-in-slot",
            slotCode: change.slotCode,
            productId: change.productId,
          },
        };
      }
      working.push({
        slotCode: change.slotCode,
        productId: change.productId,
        par: PLACEHOLDER_PAR,
        priceCents: originalPriceBySlot.get(change.slotCode),
      });
      continue;
    }

    const sourceSlotCode =
      change.kind === "move" ? change.fromSlotCode : change.slotCode;
    const source = working.find(isEntry(sourceSlotCode, change.productId));
    if (!source) {
      return {
        violation: {
          kind: "product-not-in-slot",
          slotCode: sourceSlotCode,
          productId: change.productId,
        },
      };
    }

    if (change.kind === "move") {
      if (change.fromSlotCode === change.toSlotCode) {
        return {
          violation: { kind: "move-to-same-slot", slotCode: change.toSlotCode },
        };
      }
      if (working.some(isEntry(change.toSlotCode, change.productId))) {
        return {
          violation: {
            kind: "product-already-in-slot",
            slotCode: change.toSlotCode,
            productId: change.productId,
          },
        };
      }
    }

    working = working.filter((entry) => entry !== source);
    if (change.kind === "move") {
      working.push({
        ...source,
        slotCode: change.toSlotCode,
        priceCents:
          originalPriceBySlot.get(change.toSlotCode) ?? source.priceCents,
      });
    }
  }

  const result: LayoutSlot[] = [];
  for (const entry of working) {
    const priceCents =
      priceOverrideBySlot.get(entry.slotCode) ?? entry.priceCents;
    if (priceCents === undefined) {
      return { violation: { kind: "missing-price", slotCode: entry.slotCode } };
    }
    result.push({ ...entry, priceCents });
  }
  return { slots: result };
};

export type LayoutLineMismatch =
  | { kind: "missing-line"; slotCode: string; productId: string }
  | { kind: "not-fully-removed"; slotCode: string; productId: string }
  | { kind: "move-not-transferred"; slotCode: string; productId: string }
  | { kind: "added-on-outgoing"; slotCode: string; productId: string };

type CheckedLine = Pick<
  VisitLine,
  "slotCode" | "productId" | "remaining" | "removed" | "removedReason" | "added"
>;

/**
 * The first change, in list order, whose visit lines don't back it up, or
 * null. A departing product needs a line that takes out everything counted
 * (a move says `transferred`) and loads nothing; an arriving one needs a line.
 */
export const layoutChangeLineMismatch = (
  changes: readonly LayoutChange[],
  lines: readonly CheckedLine[],
): LayoutLineMismatch | null => {
  const lineBySlotProduct = new Map<string, CheckedLine>();
  for (const line of lines) {
    lineBySlotProduct.set(slotProductKey(line), line);
  }

  for (const change of changes) {
    if (change.kind === "set-price") {
      continue;
    }

    if (change.kind === "add") {
      const { slotCode, productId } = change;
      if (!lineBySlotProduct.has(slotProductKey(change))) {
        return { kind: "missing-line", slotCode, productId };
      }
      continue;
    }

    const { productId } = change;
    const slotCode = change.kind === "move" ? change.fromSlotCode : change.slotCode;
    const departing = lineBySlotProduct.get(slotProductKey({ slotCode, productId }));
    if (!departing) {
      return { kind: "missing-line", slotCode, productId };
    }
    if (departing.removed !== departing.remaining || departing.removedReason === null) {
      return { kind: "not-fully-removed", slotCode, productId };
    }
    if (change.kind === "move" && departing.removedReason !== "transferred") {
      return { kind: "move-not-transferred", slotCode, productId };
    }
    if (departing.added !== 0) {
      return { kind: "added-on-outgoing", slotCode, productId };
    }
    if (change.kind === "move") {
      const arriving = { slotCode: change.toSlotCode, productId };
      if (!lineBySlotProduct.has(slotProductKey(arriving))) {
        return { kind: "missing-line", ...arriving };
      }
    }
  }
  return null;
};
