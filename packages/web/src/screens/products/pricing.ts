import {
  type Cents,
  markupAtPrice,
  marginFractionAtPrice,
  type ReplacementCost,
  replacementCostCentsForDisplay,
  TARGET_MARKUP,
} from "@vendpire/domain";

/**
 * Display shaping for the pricing columns and the product form's hint.
 *
 * Shaping only — every figure comes from the domain's own functions, against
 * the units and total rather than a rounded unit cost. The one decision made
 * here is a display one: a free product has a cost worth showing and no price
 * worth suggesting.
 */

/**
 * What `products.pricing` returns, structurally — the same reason `pnlRows`
 * declares `VisitLike` instead of reaching for the api package's types.
 */
export interface ProductPricing extends ReplacementCost {
  readonly productId: string;
  readonly suggestedPriceCents: Cents;
}

export interface PricingDisplay {
  readonly unitCostCents: Cents;
  /** Null for a free product, where there is no markup to take. */
  readonly suggestedPriceCents: Cents | null;
  /** Null at a zero price — an empty form field parses to zero. */
  readonly marginFraction: number | null;
  /** Gross profit on one unit. Negative when the price is under cost. */
  readonly grossPerUnitCents: Cents;
  readonly markup: number | null;
  readonly isUnderTarget: boolean;
}

/**
 * Key pricing by product. A never-purchased product is ABSENT, which is what
 * puts a dash in the row rather than a $0.00 cost.
 */
export const indexPricing = (
  pricing: readonly ProductPricing[],
): Map<string, ProductPricing> =>
  new Map(pricing.map((row) => [row.productId, row]));

/**
 * Every pricing figure for one product at one candidate price. Takes the price
 * as an argument rather than reading the saved one, so the product form can
 * recompute against the field on each keystroke.
 */
export const buildPricingDisplay = (
  pricing: ProductPricing,
  priceCents: Cents,
): PricingDisplay => {
  const markup = markupAtPrice(priceCents, pricing);
  return {
    unitCostCents: replacementCostCentsForDisplay(pricing),
    suggestedPriceCents:
      pricing.suggestedPriceCents > 0 ? pricing.suggestedPriceCents : null,
    marginFraction: marginFractionAtPrice(priceCents, pricing),
    // Against the unrounded cost, not `unitCostCents` — the rounded one is for
    // reading, never for arithmetic.
    grossPerUnitCents: Math.round(
      priceCents - pricing.totalCostCents / pricing.units,
    ),
    markup,
    // Two non-flags, for opposite reasons: a free product has no multiple of
    // zero to fall short of, and an UNPRICED one is not mispriced — the $0.00
    // in the price column is the thing to notice, not a markup warning.
    isUnderTarget: priceCents > 0 && markup !== null && markup < TARGET_MARKUP,
  };
};
