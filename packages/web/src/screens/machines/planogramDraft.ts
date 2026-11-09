/**
 * Per-machine planogram draft in localStorage, so the editor survives a tab
 * switch, a reload, or walking away mid-setup.
 */

import { useState } from "react";
import { levelAfter, type VisitLine } from "@vendpire/domain";

/** One slot of the in-progress version, as the editor's text fields hold it. */
export interface DraftSlot {
  slotCode: string;
  productId: string;
  par: string;
  price: string;
}

const draftKeyFor = (machineId: string): string =>
  `vendpire.planogramDraft.${machineId}`;

const isDraftSlot = (value: unknown): value is DraftSlot => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const slot = value as Record<string, unknown>;
  return (
    typeof slot.slotCode === "string" &&
    typeof slot.productId === "string" &&
    typeof slot.par === "string" &&
    typeof slot.price === "string"
  );
};

/** Null for anything that isn't a well-formed draft, so a bad entry is ignored. */
export const parseDraft = (raw: string | null): DraftSlot[] | null => {
  if (!raw) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every(isDraftSlot) ? value : null;
  } catch {
    return null;
  }
};

const emptySlot = (slotCode: string): DraftSlot => ({
  slotCode,
  productId: "",
  par: "",
  price: "",
});

/**
 * Editor rows for every slot the machine has NOW: each product in a slot,
 * front to back, or one empty row for a slot with none. A draft or version
 * saved against an older layout keeps the slots that still exist and drops
 * the rest.
 *
 * The rows are a flat list in which a mixed slot's code repeats, the same
 * shape the planogram stores. The helpers below address a product by its
 * slot code and its position within the slot.
 */
export const buildEditorSlots = (
  slotCodes: string[],
  source: DraftSlot[],
): DraftSlot[] =>
  slotCodes.flatMap((slotCode) => {
    const matches = source.filter((slot) => slot.slotCode === slotCode);
    return matches.length > 0 ? matches.map((slot) => ({ ...slot })) : [emptySlot(slotCode)];
  });

/** The slot's products, front to back. */
export const slotEntries = (rows: DraftSlot[], slotCode: string): DraftSlot[] =>
  rows.filter((row) => row.slotCode === slotCode);

/** Replaces the slot's entries in place, keeping every other slot where it is. */
const withSlotEntries = (
  rows: DraftSlot[],
  slotCode: string,
  entries: DraftSlot[],
): DraftSlot[] => {
  const first = rows.findIndex((row) => row.slotCode === slotCode);
  const others = rows.filter((row) => row.slotCode !== slotCode);
  if (first === -1) {
    return [...others, ...entries];
  }
  return [...others.slice(0, first), ...entries, ...others.slice(first)];
};

/** The machine charges per slot, so a price edit applies to every product in it. */
export const withSlotPrice = (
  rows: DraftSlot[],
  slotCode: string,
  price: string,
): DraftSlot[] =>
  rows.map((row) => (row.slotCode === slotCode ? { ...row, price } : row));

/** An empty product behind the slot's last one, at the slot's price and par. */
export const withProductAdded = (rows: DraftSlot[], slotCode: string): DraftSlot[] => {
  const entries = slotEntries(rows, slotCode);
  const last = entries[entries.length - 1];
  return withSlotEntries(rows, slotCode, [
    ...entries,
    { slotCode, productId: "", par: last?.par ?? "", price: last?.price ?? "" },
  ]);
};

export const withEntryPatched = (
  rows: DraftSlot[],
  slotCode: string,
  index: number,
  patch: Partial<Omit<DraftSlot, "slotCode">>,
): DraftSlot[] =>
  withSlotEntries(
    rows,
    slotCode,
    slotEntries(rows, slotCode).map((entry, i) =>
      i === index ? { ...entry, ...patch } : entry,
    ),
  );

/** Swaps a product with its neighbor; a move past either end changes nothing. */
export const withEntryMoved = (
  rows: DraftSlot[],
  slotCode: string,
  index: number,
  offset: -1 | 1,
): DraftSlot[] => {
  const entries = slotEntries(rows, slotCode);
  const target = index + offset;
  const moving = entries[index];
  const displaced = entries[target];
  if (!moving || !displaced) {
    return rows;
  }
  const next = [...entries];
  next[index] = displaced;
  next[target] = moving;
  return withSlotEntries(rows, slotCode, next);
};

/** Removing a slot's only product leaves it empty rather than gone. */
export const withEntryRemoved = (
  rows: DraftSlot[],
  slotCode: string,
  index: number,
): DraftSlot[] => {
  const remaining = slotEntries(rows, slotCode).filter((_, i) => i !== index);
  return withSlotEntries(
    rows,
    slotCode,
    remaining.length > 0 ? remaining : [emptySlot(slotCode)],
  );
};

/**
 * Products the last visit left stock of that this draft no longer holds. The
 * next visit only lists the planogram's products, so their stock would go
 * uncounted. A warning, not a block: sometimes the operator really did pull
 * them.
 */
export const stockLeftOut = ({
  entries,
  previousLines,
}: {
  entries: DraftSlot[];
  previousLines: readonly VisitLine[];
}): { slotCode: string; productId: string; units: number }[] => {
  const kept = new Set(
    entries.map((entry) => `${entry.slotCode}\u0000${entry.productId}`),
  );
  return previousLines
    .map((line) => ({
      slotCode: line.slotCode,
      productId: line.productId,
      units: levelAfter(line),
    }))
    .filter(
      (left) =>
        left.units > 0 && !kept.has(`${left.slotCode}\u0000${left.productId}`),
    );
};

// Storage can throw (private mode, blocked site data). A lost draft is better
// than a broken editor, so failures are logged and otherwise ignored.
const loadDraft = (machineId: string): DraftSlot[] | null => {
  try {
    return parseDraft(localStorage.getItem(draftKeyFor(machineId)));
  } catch (error) {
    console.error("Failed to read planogram draft:", error);
    return null;
  }
};

const writeDraft = (machineId: string, slots: DraftSlot[] | null): void => {
  try {
    if (slots) {
      localStorage.setItem(draftKeyFor(machineId), JSON.stringify(slots));
    } else {
      localStorage.removeItem(draftKeyFor(machineId));
    }
  } catch (error) {
    console.error("Failed to write planogram draft:", error);
  }
};

/** The machine's stored draft, kept in step with localStorage. */
export const usePlanogramDraft = (machineId: string) => {
  const [draft, setDraft] = useState(() => loadDraft(machineId));

  const save = (slots: DraftSlot[]) => {
    writeDraft(machineId, slots);
    setDraft(slots);
  };

  const discard = () => {
    writeDraft(machineId, null);
    setDraft(null);
  };

  return { draft, save, discard };
};
