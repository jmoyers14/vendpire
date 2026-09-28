import { describe, expect, it } from "bun:test";
import { allocateProportionally } from "./allocate.ts";

describe("allocateProportionally", () => {
  it("splits evenly when weights are equal", () => {
    expect(allocateProportionally(3000, [10, 10, 10])).toEqual([1000, 1000, 1000]);
  });

  it("always sums exactly to the total despite rounding", () => {
    const parts = allocateProportionally(1699, [10, 10, 10]);
    expect(parts.reduce((s, c) => s + c, 0)).toBe(1699);
    expect(parts).toEqual([567, 566, 566]);
  });

  it("weights by unit count", () => {
    // 20 + 10 units of a $30.00 pack → $20.00 / $10.00
    expect(allocateProportionally(3000, [20, 10])).toEqual([2000, 1000]);
  });

  it("handles zero total and zero weights without dividing by zero", () => {
    expect(allocateProportionally(0, [1, 2])).toEqual([0, 0]);
    expect(allocateProportionally(100, [0, 0])).toEqual([0, 0]);
  });
});
