/**
 * A mixed slot lists the same slot code more than once, front to back. Shared
 * by the api and web so both enforce the same slot rules.
 */

export interface SlotProduct {
  slotCode: string;
  productId: string;
}

/** One product in one slot. NUL-joined so no slot code or product id can forge another key. */
export const slotProductKey = ({ slotCode, productId }: SlotProduct): string =>
  `${slotCode}\u0000${productId}`;

export type SlotRuleViolation =
  | { readonly kind: "unknown-slot"; readonly slotCode: string }
  | {
      readonly kind: "duplicate-product";
      readonly slotCode: string;
      readonly productId: string;
    }
  /** The machine charges per slot, so a slot has exactly one price. */
  | { readonly kind: "mixed-price"; readonly slotCode: string };

/** The first slot rule a planogram version breaks, or null. Returned, not thrown, as in `normalizeSlots`. */
export const slotRuleViolation = (
  slots: readonly (SlotProduct & { priceCents: number })[],
  machineSlotCodes: ReadonlySet<string>,
): SlotRuleViolation | null => {
  const seen = new Set<string>();
  const priceBySlot = new Map<string, number>();
  for (const slot of slots) {
    if (!machineSlotCodes.has(slot.slotCode)) {
      return { kind: "unknown-slot", slotCode: slot.slotCode };
    }
    const key = slotProductKey(slot);
    if (seen.has(key)) {
      return {
        kind: "duplicate-product",
        slotCode: slot.slotCode,
        productId: slot.productId,
      };
    }
    seen.add(key);
    const price = priceBySlot.get(slot.slotCode);
    if (price !== undefined && price !== slot.priceCents) {
      return { kind: "mixed-price", slotCode: slot.slotCode };
    }
    priceBySlot.set(slot.slotCode, slot.priceCents);
  }
  return null;
};
