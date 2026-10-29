import { describe, expect, it } from "bun:test";
import { buildPricingDisplay, indexPricing } from "./pricing.ts";
import type { ProductPricing } from "./pricing.ts";

const CHEEZ_IT: ProductPricing = {
  productId: "cheez",
  units: 30,
  totalCostCents: 1749,
  purchasedAt: "2026-10-24T00:00:00.000Z",
  vendor: "Costco",
  suggestedPriceCents: 150,
};

const FREE_SAMPLE: ProductPricing = {
  productId: "sample",
  units: 12,
  totalCostCents: 0,
  purchasedAt: "2026-10-24T00:00:00.000Z",
  vendor: "Rep sample",
  suggestedPriceCents: 0,
};

describe("indexPricing", () => {
  it("keys pricing by product so a row can look its own up", () => {
    expect(indexPricing([CHEEZ_IT]).get("cheez")).toEqual(CHEEZ_IT);
  });

  it("leaves a never-purchased product absent rather than zeroed", () => {
    expect(indexPricing([CHEEZ_IT]).get("gum")).toBeUndefined();
  });
});

describe("buildPricingDisplay", () => {
  it("reports the unit cost, margin and markup at the current price", () => {
    const display = buildPricingDisplay(CHEEZ_IT, 150);

    expect(display.unitCostCents).toBe(58);
    expect(display.suggestedPriceCents).toBe(150);
    expect(display.marginFraction).toBeCloseTo(0.6113, 4);
    expect(display.markup).toBeCloseTo(2.573, 3);
  });

  it("reports what a unit keeps at the current price", () => {
    // $1.50 against a 58.3c unit cost. Subtracting the DISPLAYED 58c would say
    // 92c too, but only by luck — the unrounded cost is the one that is right.
    expect(buildPricingDisplay(CHEEZ_IT, 150).grossPerUnitCents).toBe(92);
  });

  it("reports a loss per unit when the price is under cost", () => {
    expect(buildPricingDisplay(CHEEZ_IT, 50).grossPerUnitCents).toBe(-8);
  });

  it("flags a price below the target markup", () => {
    expect(buildPricingDisplay(CHEEZ_IT, 125).isUnderTarget).toBe(true);
  });

  it("clears the flag at the suggested price", () => {
    // The suggestion has to pass its own test, or the list would flag rows that
    // are priced exactly as the app told the operator to price them.
    expect(buildPricingDisplay(CHEEZ_IT, 150).isUnderTarget).toBe(false);
  });

  it("has no margin to report at an empty price field", () => {
    const display = buildPricingDisplay(CHEEZ_IT, 0);

    expect(display.marginFraction).toBeNull();
  });

  it("does not call an unpriced product under target", () => {
    // Most of a real catalog has no price yet. "Below your markup target" is
    // the wrong thing to say about a product nobody has priced at all — the
    // $0.00 in the price column already says it.
    expect(buildPricingDisplay(CHEEZ_IT, 0).isUnderTarget).toBe(false);
  });

  it("suggests nothing for a free product, and does not flag it", () => {
    const display = buildPricingDisplay(FREE_SAMPLE, 100);

    expect(display.unitCostCents).toBe(0);
    expect(display.suggestedPriceCents).toBeNull();
    expect(display.markup).toBeNull();
    expect(display.isUnderTarget).toBe(false);
  });
});
