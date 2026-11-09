/**
 * Per-machine planogram draft in localStorage, so the editor survives a tab
 * switch, a reload, or walking away mid-setup.
 */

import { useState } from "react";
import { levelAfter, slotProductKey, type VisitLine } from "@vendpire/domain";

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
 * Editor rows for every slot the machine has NOW: each product front to back,
 * or one empty row. A mixed slot's code repeats, as the planogram stores it.
 * Slots the machine no longer has are dropped.
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
export const entriesInSlot = (rows: DraftSlot[], slotCode: string): DraftSlot[] =>
  rows.filter((row) => row.slotCode === slotCode);

/** Replaces the slot's entries, keeping every other slot where it is. */
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
  { slotCode, price }: { slotCode: string; price: string },
): DraftSlot[] =>
  rows.map((row) => (row.slotCode === slotCode ? { ...row, price } : row));

/** An empty product behind the slot's last one, at the slot's price and par. */
export const withEntryAdded = (rows: DraftSlot[], slotCode: string): DraftSlot[] => {
  const entries = entriesInSlot(rows, slotCode);
  const last = entries[entries.length - 1];
  return withSlotEntries(rows, slotCode, [
    ...entries,
    { slotCode, productId: "", par: last?.par ?? "", price: last?.price ?? "" },
  ]);
};

/** Where a product sits: its slot, and its position from the front. */
export interface EntryPosition {
  slotCode: string;
  index: number;
}

export const withEntryPatched = (
  rows: DraftSlot[],
  { slotCode, index }: EntryPosition,
  patch: Partial<Omit<DraftSlot, "slotCode">>,
): DraftSlot[] =>
  withSlotEntries(
    rows,
    slotCode,
    entriesInSlot(rows, slotCode).map((entry, i) =>
      i === index ? { ...entry, ...patch } : entry,
    ),
  );

/** Swaps a product with its neighbor; a move past either end changes nothing. */
export const withEntryMoved = (
  rows: DraftSlot[],
  { slotCode, index, offset }: EntryPosition & { offset: -1 | 1 },
): DraftSlot[] => {
  const entries = entriesInSlot(rows, slotCode);
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
  { slotCode, index }: EntryPosition,
): DraftSlot[] => {
  const remaining = entriesInSlot(rows, slotCode).filter((_, i) => i !== index);
  return withSlotEntries(
    rows,
    slotCode,
    remaining.length > 0 ? remaining : [emptySlot(slotCode)],
  );
};

/**
 * Products the last visit left stock of that this draft no longer holds; the
 * next visit won't ask about them. A warning, since they may really be pulled.
 */
export const stockLeftOut = ({
  entries,
  previousLines,
}: {
  entries: DraftSlot[];
  previousLines: readonly VisitLine[];
}): { slotCode: string; productId: string; units: number }[] => {
  const kept = new Set(entries.map(slotProductKey));
  return previousLines
    .map((line) => ({
      slotCode: line.slotCode,
      productId: line.productId,
      units: levelAfter(line),
    }))
    .filter((left) => left.units > 0 && !kept.has(slotProductKey(left)));
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
