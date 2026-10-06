import { describe, expect, it } from "bun:test";
import {
  buildCostBasis,
  cogsForUnits,
  unitCostCentsForDisplay,
} from "./unitCost.ts";
import type { CostBasisLine } from "./unitCost.ts";

const purchase = (
  productId: string,
  units: number,
  totalCostCents: number,
): CostBasisLine => ({ productId, units, totalCostCents });

const basisFor = (productId: string, lines: CostBasisLine[]) =>
  buildCostBasis(lines).get(productId);

describe("buildCostBasis", () => {
  it("sums units and cost across every purchase of a product", () => {
    const basis = basisFor("coke", [
      purchase("coke", 24, 1199),
      purchase("chips", 12, 899),
      purchase("coke", 12, 699),
    ]);

    expect(basis).toEqual({ status: "known", sumUnits: 36, sumCostCents: 1898 });
  });

  it("keeps sums rather than a unit cost, so COGS can round once", () => {
    const basis = basisFor("coke", [purchase("coke", 3, 100)]);

    // 100/3 is not representable in cents; storing it would bake in the error.
    expect(basis).toEqual({ status: "known", sumUnits: 3, sumCostCents: 100 });
  });

  it("leaves a product with no purchases out of the map entirely", () => {
    expect(basisFor("bar", [purchase("coke", 24, 1199)])).toBeUndefined();
  });

  it("reports a product whose purchases carry no units as unknown", () => {
    expect(basisFor("coke", [purchase("coke", 0, 1199)])).toEqual({
      status: "unknown",
      reason: "no-units",
    });
  });

  it("handles an empty purchase history", () => {
    expect(buildCostBasis([]).size).toBe(0);
  });

  it("needs no pack knowledge — expanded lines are just lines", () => {
    // PurchaseServiceImpl.expandPackLines already split the pack by unit count.
    const basis = basisFor("coke", [
      purchase("coke", 24, 1199),
      purchase("coke", 12, 599),
    ]);

    expect(basis).toEqual({ status: "known", sumUnits: 36, sumCostCents: 1798 });
  });
});

describe("cogsForUnits", () => {
  it("rounds once at the end, not per unit", () => {
    const basis = basisFor("x", [purchase("x", 3, 100)]);

    // round(7 × 100 / 3) = round(233.33) = 233.
    // Rounding per unit first gives round(100/3) × 7 = 33 × 7 = 231 — off by 2c.
    expect(cogsForUnits(7, basis)).toEqual({ status: "known", cogsCents: 233 });
    expect(cogsForUnits(7, basis)).not.toEqual({ status: "known", cogsCents: 231 });
  });

  it("costs a full sell-through at exactly what you paid", () => {
    const lines = [purchase("coke", 30, 1499), purchase("coke", 10, 699)];
    const basis = basisFor("coke", lines);

    // Buying all of it and selling all of it costs the receipt total, to the cent.
    expect(cogsForUnits(40, basis)).toEqual({ status: "known", cogsCents: 2198 });
  });

  it("weights by units rather than averaging the purchase prices", () => {
    const basis = basisFor("coke", [
      purchase("coke", 30, 1499),
      purchase("coke", 10, 699),
    ]);

    // An arithmetic mean of 49.97c and 69.9c would give about 2396c for 40 units.
    expect(cogsForUnits(40, basis)).toEqual({ status: "known", cogsCents: 2198 });
  });

  it("reports a product with no purchase history as unknown, NOT as zero", () => {
    const result = cogsForUnits(7, undefined);

    // Booking zero COGS inflates profit — the one error a vending operator
    // cannot afford, because it looks like a great week.
    expect(result).toEqual({ status: "unknown", reason: "no-purchases" });
    expect(result).not.toEqual({ status: "known", cogsCents: 0 });
  });

  it("passes a no-units basis through as unknown", () => {
    const basis = basisFor("coke", [purchase("coke", 0, 1199)]);

    expect(cogsForUnits(7, basis)).toEqual({
      status: "unknown",
      reason: "no-units",
    });
  });

  it("costs zero units at zero", () => {
    const basis = basisFor("x", [purchase("x", 3, 100)]);

    expect(cogsForUnits(0, basis)).toEqual({ status: "known", cogsCents: 0 });
  });

  it("gives negative sold a negative cost, so a sequence still sums true", () => {
    const basis = basisFor("x", [purchase("x", 10, 1000)]);

    expect(cogsForUnits(-2, basis)).toEqual({ status: "known", cogsCents: -200 });
  });
});

describe("unitCostCentsForDisplay", () => {
  it("rounds a per-unit cost for display", () => {
    const basis = basisFor("coke", [
      purchase("coke", 24, 1199),
      purchase("coke", 12, 699),
    ]);

    expect(unitCostCentsForDisplay(basis!)).toBe(53); // 1898/36 = 52.7c
  });

  it("is display-only — multiplying it by a count drifts from the real COGS", () => {
    const basis = basisFor("coke", [
      purchase("coke", 24, 1199),
      purchase("coke", 12, 699),
    ]);

    const perUnit = unitCostCentsForDisplay(basis!);
    const real = cogsForUnits(7, basis);

    expect(perUnit! * 7).toBe(371);
    expect(real).toEqual({ status: "known", cogsCents: 369 });
  });

  it("has nothing to show when the cost is unknown", () => {
    const basis = basisFor("coke", [purchase("coke", 0, 1199)]);

    expect(unitCostCentsForDisplay(basis!)).toBeNull();
  });
});
