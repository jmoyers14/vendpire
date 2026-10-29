import { describe, expect, it } from "bun:test";
import { buildPricingDisplay } from "./pricing.ts";
import type { ApiProductPricing } from "../../apiTypes.ts";

const CHEEZ_IT: ApiProductPricing = {
  productId: "cheez",
  units: 30,
  totalCostCents: 1749,
  purchasedAt: "2026-10-24T00:00:00.000Z",
  vendor: "Costco",
  suggestedPriceCents: 150,
};

const FREE_SAMPLE: ApiProductPricing = {
  productId: "sample",
  units: 12,
  totalCostCents: 0,
  purchasedAt: "2026-10-24T00:00:00.000Z",
  vendor: "Rep sample",
  suggestedPriceCents: null,
};

describe("buildPricingDisplay", () => {
  it("assembles every figure for the current price", () => {
    const display = buildPricingDisplay(CHEEZ_IT, 150);

    expect(display).toEqual({
      unitCostCents: 58,
      suggestedPriceCents: 150,
      marginFraction: display.marginFraction,
      grossPerUnitCents: 92,
      isUnderTarget: false,
    });
    expect(display.marginFraction).toBeCloseTo(0.6113, 4);
  });

  it("carries the domain's flag for a price below target", () => {
    expect(buildPricingDisplay(CHEEZ_IT, 125).isUnderTarget).toBe(true);
  });

  it("has no margin to report at an empty price field", () => {
    expect(buildPricingDisplay(CHEEZ_IT, 0).marginFraction).toBeNull();
  });

  it("passes through a free product's absent suggestion", () => {
    const display = buildPricingDisplay(FREE_SAMPLE, 100);

    expect(display.unitCostCents).toBe(0);
    expect(display.suggestedPriceCents).toBeNull();
    expect(display.isUnderTarget).toBe(false);
  });
});
