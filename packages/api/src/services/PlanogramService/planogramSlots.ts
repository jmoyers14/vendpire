import type {
  LayoutChangeViolation,
  LayoutLineMismatch,
  SlotRuleViolation,
} from "@vendpire/domain";

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

export const layoutChangeMessage = (
  problem: LayoutChangeViolation | LayoutLineMismatch,
): string => {
  switch (problem.kind) {
    case "product-not-in-slot":
      return `Slot ${problem.slotCode} does not hold product ${problem.productId}`;
    case "product-already-in-slot":
      return `Slot ${problem.slotCode} already holds product ${problem.productId}`;
    case "missing-price":
      return `Slot ${problem.slotCode} has no price; set one for the product going in`;
    case "move-to-same-slot":
      return `Slot ${problem.slotCode}: a move needs a different destination slot`;
    case "missing-line":
      return `Slot ${problem.slotCode}: product ${problem.productId} has no count on this visit`;
    case "not-fully-removed":
      return `Slot ${problem.slotCode}: product ${problem.productId} leaves the slot, so everything counted must be removed with a reason`;
    case "move-not-transferred":
      return `Slot ${problem.slotCode}: product ${problem.productId} is moving, so its removal reason must be transferred`;
    case "added-on-outgoing":
      return `Slot ${problem.slotCode}: product ${problem.productId} is leaving, so nothing can be added to it`;
  }
};
