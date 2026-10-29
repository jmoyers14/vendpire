import type { Cents } from "../types/index.ts";

/**
 * A suggested sell price, derived from what the product cost to buy LAST —
 * replacement cost, not the all-time weighted average in `unitCost.ts`.
 *
 * The two bases answer different questions and both are right. COGS asks what
 * the units already sold actually cost, and has to let a late receipt correct
 * history. Pricing asks what the next case will cost, where an average that
 * drags a retired case price forward is just wrong.
 */

/**
 * Vending rule of thumb: ~3x replacement cost, which lands near a 65-70% gross
 * margin once rounded. A constant rather than an org setting while there is one
 * operator; `Organization.ts` is where it goes when that changes.
 */
export const TARGET_MARKUP = 3.0;

/** Quarters — what coin mechs take and what vending prices read as. */
export const PRICE_INCREMENT_CENTS = 25;

/**
 * One purchase line, carrying when and from whom. Mirrors a `Purchase.lines[]`
 * entry plus its parent's id, date and vendor.
 */
export interface ReplacementCostLine {
  readonly productId: string;
  readonly purchaseId: string;
  readonly units: number;
  readonly totalCostCents: Cents;
  readonly purchasedAt: string;
  readonly vendor: string;
}

/**
 * The latest line for one product. Units and total are kept apart, as in
 * `unitCost.ts`, so every derivation divides exactly once.
 */
export interface ReplacementCost {
  readonly units: number;
  readonly totalCostCents: Cents;
  readonly purchasedAt: string;
  readonly vendor: string;
}

/**
 * `purchasedAt` is not unique — several supply runs share a date — so the
 * tiebreak on `purchaseId` is what makes "the latest line" well defined and
 * independent of the order the lines arrive in.
 */
const isNewer = (line: ReplacementCostLine, held: ReplacementCostLine) => {
  if (line.purchasedAt !== held.purchasedAt) {
    return line.purchasedAt > held.purchasedAt;
  }
  return line.purchaseId > held.purchaseId;
};

/**
 * Index the latest purchase line per product. A product with no usable line is
 * ABSENT rather than present with a zero — the same honest-unknown discipline
 * `buildCostBasis` keeps, and a fresh catalog is mostly absences.
 */
export const buildReplacementCosts = (
  lines: readonly ReplacementCostLine[],
): Map<string, ReplacementCost> => {
  const latest = new Map<string, ReplacementCostLine>();

  for (const line of lines) {
    // A zero-unit line cannot be a divisor, so it never becomes the basis.
    if (line.units <= 0) {
      continue;
    }
    const held = latest.get(line.productId);
    if (!held || isNewer(line, held)) {
      latest.set(line.productId, line);
    }
  }

  const costs = new Map<string, ReplacementCost>();
  for (const [productId, line] of latest) {
    costs.set(productId, {
      units: line.units,
      totalCostCents: line.totalCostCents,
      purchasedAt: line.purchasedAt,
      vendor: line.vendor,
    });
  }
  return costs;
};

/**
 * FOR DISPLAY ONLY — "about $0.58 each". NEVER multiply this by a count; COGS
 * has `cogsForUnits` and a different basis.
 */
export const replacementCostCentsForDisplay = (cost: ReplacementCost): Cents =>
  Math.round(cost.totalCostCents / cost.units);

/**
 * The smallest price point at or above `TARGET_MARKUP` x replacement cost.
 *
 * Divides once, against the increment, so no intermediate per-unit cost is
 * rounded on the way. Rounding UP rather than to-nearest is what lets the
 * suggestion promise the markup it names; a cost already landing on a quarter
 * is left where it is.
 */
export const suggestedPriceCents = (cost: ReplacementCost): Cents => {
  const increments = Math.ceil(
    (cost.totalCostCents * TARGET_MARKUP) /
      (PRICE_INCREMENT_CENTS * cost.units),
  );
  return increments * PRICE_INCREMENT_CENTS;
};

/**
 * What multiple of replacement cost `priceCents` clears. Null for a free
 * product, where the multiple is infinite rather than large.
 */
export const markupAtPrice = (
  priceCents: Cents,
  cost: ReplacementCost,
): number | null => {
  if (cost.totalCostCents <= 0) {
    return null;
  }
  return (priceCents * cost.units) / cost.totalCostCents;
};

/**
 * Gross margin at `priceCents`, as a fraction. Negative when the price is under
 * cost — never clamped, because selling at a loss is the thing worth seeing.
 *
 * Null at a zero price: the product form recomputes this on every keystroke and
 * an empty field parses to zero.
 */
export const marginFractionAtPrice = (
  priceCents: Cents,
  cost: ReplacementCost,
): number | null => {
  if (priceCents <= 0) {
    return null;
  }
  return 1 - cost.totalCostCents / (cost.units * priceCents);
};
