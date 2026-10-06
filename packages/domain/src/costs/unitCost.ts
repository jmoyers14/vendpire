import type { Cents } from "../types/index.ts";

/**
 * Weighted-average unit cost, derived from purchases rather than stored on the
 * product — which is what lets a receipt entered three weeks late retroactively
 * correct COGS, exactly as `Product.ts` promises by refusing to store one.
 *
 * The average is ALL-TIME per product per org in v1. The purchase set is a
 * parameter, so narrowing it to as-of-interval later is a caller change rather
 * than a change in here.
 */

/**
 * One purchase line. Mirrors a `Purchase.lines[]` entry: the TOTAL cost, never
 * a unit cost, because $14.99 / 30 does not divide evenly and the total is what
 * the receipt actually says.
 *
 * Pack expansion has already happened server-side, so this needs no pack
 * knowledge — an expanded line is just a line.
 */
export interface CostBasisLine {
  readonly productId: string;
  readonly units: number;
  readonly totalCostCents: Cents;
}

export type UnknownCostReason = "no-purchases" | "no-units";

/**
 * Sums, deliberately — not a unit cost. Keeping the numerator and denominator
 * apart is what lets `cogsForUnits` divide exactly once, at the end.
 */
export type UnitCost =
  | {
      readonly status: "known";
      readonly sumUnits: number;
      readonly sumCostCents: Cents;
    }
  | { readonly status: "unknown"; readonly reason: UnknownCostReason };

export type Cogs =
  | { readonly status: "known"; readonly cogsCents: Cents }
  | { readonly status: "unknown"; readonly reason: UnknownCostReason };

/**
 * Index purchase lines by product. A product with no purchases is ABSENT from
 * the map rather than present with a zero — `cogsForUnits` turns that absence
 * into an honest unknown.
 */
export const buildCostBasis = (
  lines: readonly CostBasisLine[],
): Map<string, UnitCost> => {
  const sums = new Map<string, { sumUnits: number; sumCostCents: Cents }>();

  for (const line of lines) {
    const running = sums.get(line.productId) ?? { sumUnits: 0, sumCostCents: 0 };
    sums.set(line.productId, {
      sumUnits: running.sumUnits + line.units,
      sumCostCents: running.sumCostCents + line.totalCostCents,
    });
  }

  const basis = new Map<string, UnitCost>();
  for (const [productId, { sumUnits, sumCostCents }] of sums) {
    if (sumUnits === 0) {
      basis.set(productId, { status: "unknown", reason: "no-units" });
      continue;
    }
    basis.set(productId, { status: "known", sumUnits, sumCostCents });
  }
  return basis;
};

/**
 * Cost of goods sold for `units` of one product.
 *
 * `units × sumCost / sumUnits`, rounded ONCE at the end. Rounding a per-unit
 * cost to cents and then multiplying drifts — two cents on a single slot in a
 * single week, compounding across every slot and every interval.
 *
 * A missing basis is `unknown`, NEVER zero: booking zero COGS inflates profit,
 * and a fresh catalog has plenty of products with no purchase history.
 *
 * Negative `units` yield a negative cost, because negative sold is real and is
 * never clamped — the sequence still sums to the truth.
 */
export const cogsForUnits = (
  units: number,
  basis: UnitCost | undefined,
): Cogs => {
  if (!basis) {
    return { status: "unknown", reason: "no-purchases" };
  }
  if (basis.status === "unknown") {
    return { status: "unknown", reason: basis.reason };
  }
  return {
    status: "known",
    cogsCents: Math.round((units * basis.sumCostCents) / basis.sumUnits),
  };
};

/**
 * FOR DISPLAY ONLY — "about $0.53 each". Null when the cost is unknown.
 *
 * NEVER multiply this by a count. It is the rounded per-unit cost that
 * `cogsForUnits` deliberately avoids computing: 53 × 7 = 371 where the real
 * COGS is 369.
 */
export const unitCostCentsForDisplay = (basis: UnitCost): Cents | null => {
  if (basis.status === "unknown") {
    return null;
  }
  return Math.round(basis.sumCostCents / basis.sumUnits);
};
