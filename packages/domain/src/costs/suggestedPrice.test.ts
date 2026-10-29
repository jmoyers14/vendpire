import { describe, expect, it } from "bun:test";
import {
  buildReplacementCosts,
  grossPerUnitCentsAtPrice,
  isUnderTargetMarkup,
  markupAtPrice,
  marginFractionAtPrice,
  replacementCostCentsForDisplay,
  suggestedPriceCentsFor,
  TARGET_MARKUP,
} from "./suggestedPrice.ts";
import type { ReplacementCost, ReplacementCostLine } from "./suggestedPrice.ts";

const line = (
  productId: string,
  units: number,
  totalCostCents: number,
  purchasedAt: string,
  purchaseId = `p-${purchasedAt}-${productId}`,
  vendor = "Costco",
): ReplacementCostLine => ({
  productId,
  purchaseId,
  units,
  totalCostCents,
  purchasedAt,
  vendor,
});

const costOf = (units: number, totalCostCents: number): ReplacementCost => ({
  units,
  totalCostCents,
  purchasedAt: "2026-10-24T00:00:00.000Z",
  vendor: "Costco",
});

describe("buildReplacementCosts", () => {
  it("takes the latest purchase, not an average of the history", () => {
    const costs = buildReplacementCosts([
      line("coke", 36, 1199, "2026-08-01T00:00:00.000Z"),
      line("coke", 36, 1439, "2026-10-24T00:00:00.000Z"),
    ]);

    expect(costs.get("coke")).toEqual({
      units: 36,
      totalCostCents: 1439,
      purchasedAt: "2026-10-24T00:00:00.000Z",
      vendor: "Costco",
    });
  });

  it("keeps units and total apart rather than storing a unit cost", () => {
    const costs = buildReplacementCosts([
      line("coke", 3, 100, "2026-10-24T00:00:00.000Z"),
    ]);

    expect(costs.get("coke")?.units).toBe(3);
    expect(costs.get("coke")?.totalCostCents).toBe(100);
  });

  it("leaves a product with no purchases out of the map entirely", () => {
    const costs = buildReplacementCosts([
      line("coke", 36, 1199, "2026-10-24T00:00:00.000Z"),
    ]);

    expect(costs.get("gum")).toBeUndefined();
  });

  it("skips a zero-unit line rather than dividing by it", () => {
    const costs = buildReplacementCosts([
      line("coke", 36, 1199, "2026-08-01T00:00:00.000Z"),
      line("coke", 0, 500, "2026-10-24T00:00:00.000Z"),
    ]);

    // The later line cannot be a basis, so the earlier one still answers.
    expect(costs.get("coke")?.totalCostCents).toBe(1199);
  });

  it("leaves out a product whose only line carries no units", () => {
    const costs = buildReplacementCosts([
      line("coke", 0, 500, "2026-10-24T00:00:00.000Z"),
    ]);

    expect(costs.get("coke")).toBeUndefined();
  });

  it("keeps a zero-cost line, because paying nothing is a fact", () => {
    const costs = buildReplacementCosts([
      line("sample", 12, 0, "2026-10-24T00:00:00.000Z"),
    ]);

    expect(costs.get("sample")?.totalCostCents).toBe(0);
  });

  it("breaks a shared purchasedAt on purchaseId, descending", () => {
    const costs = buildReplacementCosts([
      line("coke", 36, 1199, "2026-10-24T00:00:00.000Z", "aaa"),
      line("coke", 36, 1439, "2026-10-24T00:00:00.000Z", "bbb"),
    ]);

    expect(costs.get("coke")?.totalCostCents).toBe(1439);
  });

  it("does not depend on the order the lines arrive in", () => {
    const lines = [
      line("coke", 36, 1199, "2026-08-01T00:00:00.000Z", "aaa"),
      line("coke", 36, 1439, "2026-10-24T00:00:00.000Z", "bbb"),
      line("coke", 36, 1299, "2026-10-24T00:00:00.000Z", "ccc"),
    ];

    const forward = buildReplacementCosts(lines).get("coke");
    const reversed = buildReplacementCosts([...lines].reverse()).get("coke");

    expect(forward).toEqual(reversed);
    expect(forward?.totalCostCents).toBe(1299);
  });

  it("handles an empty purchase history", () => {
    expect(buildReplacementCosts([]).size).toBe(0);
  });
});

describe("replacementCostCentsForDisplay", () => {
  it("rounds the unit cost to cents for 'about $0.58 each'", () => {
    expect(replacementCostCentsForDisplay(costOf(30, 1749))).toBe(58);
  });
});

describe("suggestedPriceCentsFor", () => {
  it.each([
    [36, 1199, 75],
    [40, 2200, 125],
    [30, 1749, 150],
    [24, 1728, 175],
    [10, 1100, 250],
  ])("prices %i units at %i cents to %i", (units, totalCostCents, expected) => {
    expect(suggestedPriceCentsFor(costOf(units, totalCostCents))).toBe(expected);
  });

  it("leaves a cost already landing on a quarter alone", () => {
    // $1.00 x 2.25 = $2.25 exactly; rounding up again would overshoot.
    expect(suggestedPriceCentsFor(costOf(12, 1200))).toBe(225);
  });

  it("never suggests a price below the target markup", () => {
    for (let totalCostCents = 1; totalCostCents <= 400; totalCostCents++) {
      const cost = costOf(7, totalCostCents);
      const suggested = suggestedPriceCentsFor(cost);

      expect(suggested).not.toBeNull();
      expect(markupAtPrice(suggested as number, cost)).toBeGreaterThanOrEqual(
        TARGET_MARKUP,
      );
    }
  });

  it("suggests nothing for a free product", () => {
    expect(suggestedPriceCentsFor(costOf(12, 0))).toBeNull();
  });
});

describe("markupAtPrice", () => {
  it("reports the multiple the current price actually clears", () => {
    expect(markupAtPrice(150, costOf(30, 1749))).toBeCloseTo(2.573, 3);
  });

  it("is unknown for a free product rather than infinite", () => {
    expect(markupAtPrice(150, costOf(12, 0))).toBeNull();
  });
});

describe("marginFractionAtPrice", () => {
  it("reports gross margin at the current price", () => {
    expect(marginFractionAtPrice(150, costOf(30, 1749))).toBeCloseTo(0.6113, 4);
  });

  it("is negative when the price is under cost, never clamped", () => {
    expect(marginFractionAtPrice(50, costOf(30, 1749))).toBeLessThan(0);
  });

  it("is unknown at a zero price rather than infinite", () => {
    // The product form recomputes this on every keystroke, and an empty field
    // parses to zero.
    expect(marginFractionAtPrice(0, costOf(30, 1749))).toBeNull();
  });
});

describe("grossPerUnitCentsAtPrice", () => {
  it("reports what a unit keeps at the current price", () => {
    // $1.50 against a 58.3c unit cost, from the unrounded basis.
    expect(grossPerUnitCentsAtPrice(150, costOf(30, 1749))).toBe(92);
  });

  it("reports a loss per unit when the price is under cost", () => {
    expect(grossPerUnitCentsAtPrice(50, costOf(30, 1749))).toBe(-8);
  });
});

describe("isUnderTargetMarkup", () => {
  it("flags a price below the target markup", () => {
    expect(isUnderTargetMarkup(125, costOf(30, 1749))).toBe(true);
  });

  it("clears at the suggested price", () => {
    // The suggestion has to pass its own test, or every row the app priced
    // would come back flagged.
    expect(isUnderTargetMarkup(150, costOf(30, 1749))).toBe(false);
  });

  it("does not flag an unpriced product", () => {
    expect(isUnderTargetMarkup(0, costOf(30, 1749))).toBe(false);
  });

  it("does not flag a free product", () => {
    expect(isUnderTargetMarkup(100, costOf(12, 0))).toBe(false);
  });
});
