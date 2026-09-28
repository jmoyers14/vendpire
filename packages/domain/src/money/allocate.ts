import type { Cents } from "../types/index.ts";

/**
 * Split a total (in cents) across weights proportionally, using the
 * largest-remainder method so the parts always sum EXACTLY to the total —
 * no penny ever appears or vanishes. Used to spread a pack's receipt cost
 * across its contents by unit count.
 */
export const allocateProportionally = (
  totalCents: Cents,
  weights: number[],
): Cents[] => {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    return weights.map(() => 0);
  }
  const exact = weights.map((weight) => (totalCents * weight) / totalWeight);
  const floors = exact.map(Math.floor);
  let remainder = totalCents - floors.reduce((sum, cents) => sum + cents, 0);
  // Hand leftover pennies to the largest fractional parts first.
  const order = exact
    .map((value, index) => ({ frac: value - Math.floor(value), index }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) {
      break;
    }
    result[index] += 1;
    remainder -= 1;
  }
  return result;
};
