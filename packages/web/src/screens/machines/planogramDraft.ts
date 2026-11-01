/**
 * Per-machine planogram draft in localStorage, so the editor survives a tab
 * switch, a reload, or walking away mid-setup.
 */

import { useState } from "react";

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

/**
 * One editor row per slot the machine has NOW. A draft or version saved
 * against an older layout keeps the slots that still exist and drops the rest.
 */
export const buildEditorSlots = (
  slotCodes: string[],
  source: DraftSlot[],
): DraftSlot[] =>
  slotCodes.map((slotCode) => {
    const match = source.find((slot) => slot.slotCode === slotCode);
    return {
      slotCode,
      productId: match?.productId ?? "",
      par: match?.par ?? "",
      price: match?.price ?? "",
    };
  });

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
