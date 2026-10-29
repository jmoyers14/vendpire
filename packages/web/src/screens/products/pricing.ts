import {
  type Cents,
  grossPerUnitCentsAtPrice,
  isUnderTargetMarkup,
  marginFractionAtPrice,
  replacementCostCentsForDisplay,
} from "@vendpire/domain";
import type { ApiProductPricing } from "../../apiTypes.ts";

/**
 * Shaping for the pricing columns and the product form's hint. Assembly only —
 * every figure comes from a domain function, so iOS and a future caller cannot
 * drift from what the web shows.
 */
export interface PricingDisplay {
  readonly unitCostCents: Cents;
  readonly suggestedPriceCents: Cents | null;
  /** Null at a zero price — an empty form field parses to zero. */
  readonly marginFraction: number | null;
  readonly grossPerUnitCents: Cents;
  readonly isUnderTarget: boolean;
}

/**
 * Every pricing figure for one product at one candidate price. Takes the price
 * as an argument rather than reading the saved one, so the product form can
 * recompute against the field on each keystroke.
 */
export const buildPricingDisplay = (
  pricing: ApiProductPricing,
  priceCents: Cents,
): PricingDisplay => ({
  unitCostCents: replacementCostCentsForDisplay(pricing),
  suggestedPriceCents: pricing.suggestedPriceCents,
  marginFraction: marginFractionAtPrice(priceCents, pricing),
  grossPerUnitCents: grossPerUnitCentsAtPrice(priceCents, pricing),
  isUnderTarget: isUnderTargetMarkup(priceCents, pricing),
});
