import type { PlanogramSlot } from "@vendpire/platform";

/**
 * The slot rules a planogram version must satisfy, shared by the planogram
 * editor's save and a visit that adds a product behind.
 *
 * A mixed slot is the same slot code listed more than once, front to back. The
 * machine charges per slot, never per product, so every entry for one slot
 * carries the same price.
 */

/** A product the operator loaded behind the slot's existing products. */
export interface AddedBehind {
  slotCode: string;
  productId: string;
}

/** The first rule a set of slots breaks, or null when they're all valid. */
export const slotRuleViolation = (
  slots: readonly PlanogramSlot[],
  machineSlotCodes: ReadonlySet<string>,
): string | null => {
  const seenPairs = new Set<string>();
  const priceBySlot = new Map<string, number>();
  for (const slot of slots) {
    if (!machineSlotCodes.has(slot.slotCode)) {
      return `Machine has no slot ${slot.slotCode}`;
    }
    const pair = `${slot.slotCode}\u0000${slot.productId}`;
    if (seenPairs.has(pair)) {
      return `Duplicate product ${slot.productId} in slot ${slot.slotCode}`;
    }
    seenPairs.add(pair);
    const price = priceBySlot.get(slot.slotCode);
    if (price !== undefined && price !== slot.priceCents) {
      return `Slot ${slot.slotCode} has more than one price; every product in a slot sells at the slot's price`;
    }
    priceBySlot.set(slot.slotCode, slot.priceCents);
  }
  return null;
};

/**
 * The slots with each addition placed directly behind its slot's last product,
 * at that slot's price and par. Pure: returns a new array.
 */
export const slotsWithAddedBehind = (
  slots: readonly PlanogramSlot[],
  additions: readonly AddedBehind[],
): PlanogramSlot[] => {
  const result = [...slots];
  for (const addition of additions) {
    const lastIndex = result.reduce(
      (found, slot, index) => (slot.slotCode === addition.slotCode ? index : found),
      -1,
    );
    const front = result[lastIndex];
    if (!front) {
      throw new Error(`Slot ${addition.slotCode} has no product to add behind`);
    }
    result.splice(lastIndex + 1, 0, {
      slotCode: addition.slotCode,
      productId: addition.productId,
      par: front.par,
      priceCents: front.priceCents,
    });
  }
  return result;
};
