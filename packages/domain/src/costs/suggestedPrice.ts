import type { Cents } from "../types/index.ts";
import type { CostBasisLine } from "./unitCost.ts";

/**
 * Suggested sell price from the LAST purchase — replacement cost, not the
 * all-time average in `unitCost.ts`. COGS lets a late receipt correct history;
 * pricing asks what the next case will cost.
 */

/**
 * 2.25x replacement cost, landing near a 55% margin after rounding. A constant
 * while there is one operator; it moves to `Organization.ts` when that changes.
 */
export const TARGET_MARKUP = 2.25;

/** Quarters — what coin mechs take and what vending prices read as. */
const PRICE_INCREMENT_CENTS = 25;

/** A `CostBasisLine` plus which purchase it came from. */
export interface ReplacementCostLine extends CostBasisLine {
  readonly purchaseId: string;
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
 * ABSENT rather than present with a zero, as `buildCostBasis` leaves it — a
 * fresh catalog is mostly absences.
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
 * Null for a free product, which has no markup to take.
 *
 * Rounding UP rather than to-nearest is what lets the suggestion promise the
 * markup it names; a cost already landing on a quarter is left where it is.
 */
export const suggestedPriceCentsFor = (
  cost: ReplacementCost,
): Cents | null => {
  if (cost.totalCostCents <= 0) {
    return null;
  }
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
 * Gross margin at `priceCents`, as a fraction. Null at a zero price, since an
 * empty price field parses to zero. Negative when the price is under cost —
 * never clamped, because selling at a loss is the thing worth seeing.
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

/** Gross profit on one unit. Negative when the price is under cost. */
export const grossPerUnitCentsAtPrice = (
  priceCents: Cents,
  cost: ReplacementCost,
): Cents => Math.round(priceCents - cost.totalCostCents / cost.units);

/**
 * Whether `priceCents` falls short of `TARGET_MARKUP`. False for an unpriced
 * product — the $0.00 is the thing to notice, not a markup warning — and for a
 * free one, which has no multiple of zero to fall short of.
 */
export const isUnderTargetMarkup = (
  priceCents: Cents,
  cost: ReplacementCost,
): boolean => {
  const markup = markupAtPrice(priceCents, cost);
  return priceCents > 0 && markup !== null && markup < TARGET_MARKUP;
};
