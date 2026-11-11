/**
 * Layout changes made during a visit (moves, swaps, pulls, new products),
 * applied to a planogram's slots. Pure: violations are returned, never
 * thrown, as in `slotRuleViolation`. Verbs: `docs/diagrams/visit-layout-changes.md`.
 */

import type { VisitLine } from "../visits/types.ts";
import { slotProductKey } from "./mixedSlots.ts";

/** Par is ignored in this operation; every new entry carries this placeholder. */
export const PLACEHOLDER_PAR = 10;

export interface MoveChange {
  kind: "move";
  productId: string;
  fromSlotCode: string;
  toSlotCode: string;
}

export interface RemoveChange {
  kind: "remove";
  slotCode: string;
  productId: string;
}

export interface AddChange {
  kind: "add";
  slotCode: string;
  productId: string;
}

export interface SetPriceChange {
  kind: "set-price";
  slotCode: string;
  priceCents: number;
}

export type LayoutChange = MoveChange | RemoveChange | AddChange | SetPriceChange;

export const isMoveChange = (change: LayoutChange): change is MoveChange =>
  change.kind === "move";

export const isRemoveChange = (change: LayoutChange): change is RemoveChange =>
  change.kind === "remove";

export const isAddChange = (change: LayoutChange): change is AddChange =>
  change.kind === "add";

export const isSetPriceChange = (change: LayoutChange): change is SetPriceChange =>
  change.kind === "set-price";

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
    if (isSetPriceChange(change)) {
      priceOverrideBySlot.set(change.slotCode, change.priceCents);
      continue;
    }

    if (isAddChange(change)) {
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
      isMoveChange(change) ? change.fromSlotCode : change.slotCode;
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

    if (isMoveChange(change)) {
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
    if (isMoveChange(change)) {
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
    if (isSetPriceChange(change)) {
      continue;
    }

    if (isAddChange(change)) {
      const { slotCode, productId } = change;
      if (!lineBySlotProduct.has(slotProductKey(change))) {
        return { kind: "missing-line", slotCode, productId };
      }
      continue;
    }

    const { productId } = change;
    const slotCode = isMoveChange(change) ? change.fromSlotCode : change.slotCode;
    const departing = lineBySlotProduct.get(slotProductKey({ slotCode, productId }));
    if (!departing) {
      return { kind: "missing-line", slotCode, productId };
    }
    // Sold out: nothing to pull, so no reason is needed (the engine reads it only when removed > 0).
    const isSoldOut = departing.remaining === 0;
    if (departing.removed !== departing.remaining) {
      return { kind: "not-fully-removed", slotCode, productId };
    }
    if (!isSoldOut && departing.removedReason === null) {
      return { kind: "not-fully-removed", slotCode, productId };
    }
    if (!isSoldOut && isMoveChange(change) && departing.removedReason !== "transferred") {
      return { kind: "move-not-transferred", slotCode, productId };
    }
    if (departing.added !== 0) {
      return { kind: "added-on-outgoing", slotCode, productId };
    }
    if (isMoveChange(change)) {
      const arriving = { slotCode: change.toSlotCode, productId };
      if (!lineBySlotProduct.has(slotProductKey(arriving))) {
        return { kind: "missing-line", ...arriving };
      }
    }
  }
  return null;
};
