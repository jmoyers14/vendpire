import {
  lastIndexInSlot,
  type SlotProduct,
  type SlotRuleViolation,
} from "@vendpire/domain";
import type { PlanogramSlot } from "@vendpire/platform";

/** A product loaded behind a slot's existing ones during a visit. */
export type AddedBehind = SlotProduct;

export const slotRuleMessage = (violation: SlotRuleViolation): string => {
  switch (violation.kind) {
    case "unknown-slot":
      return `Machine has no slot ${violation.slotCode}`;
    case "duplicate-product":
      return `Duplicate product ${violation.productId} in slot ${violation.slotCode}`;
    case "mixed-price":
      return `Slot ${violation.slotCode} has more than one price; every product in a slot sells at the slot's price`;
  }
};

/** Each addition placed behind its slot's last product, at that slot's price and par. */
export const slotsWithAddedBehind = (
  slots: readonly PlanogramSlot[],
  additions: readonly AddedBehind[],
): PlanogramSlot[] => {
  const result = [...slots];
  for (const addition of additions) {
    const lastIndex = lastIndexInSlot(result, addition.slotCode);
    const back = result[lastIndex];
    if (!back) {
      throw new Error(`Slot ${addition.slotCode} has no product to add behind`);
    }
    result.splice(lastIndex + 1, 0, {
      ...addition,
      par: back.par,
      priceCents: back.priceCents,
    });
  }
  return result;
};
