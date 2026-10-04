import { describe, expect, it } from "bun:test";
import { previewPackSplit } from "./packSplit.ts";

const variety = {
  contents: [
    { productId: "doritos", units: 10 },
    { productId: "cheetos", units: 10 },
    { productId: "lays", units: 10 },
  ],
};
const single = { contents: [{ productId: "coke", units: 24 }] };

describe("previewPackSplit", () => {
  it("multiplies units by the number of packs", () => {
    const parts = previewPackSplit(single, "2", "30.00");
    expect(parts?.[0]).toMatchObject({ productId: "coke", units: 48 });
  });

  it("splits cost evenly across equal contents", () => {
    const parts = previewPackSplit(variety, "1", "30.00");
    expect(parts?.map((part) => part.cents)).toEqual([1000, 1000, 1000]);
  });

  // Largest-remainder allocation: the parts must sum to exactly what was paid,
  // which is the whole reason the server and this preview share an allocator.
  it("sums to the total exactly when it doesn't divide evenly", () => {
    const parts = previewPackSplit(variety, "1", "10.00");
    expect(parts?.reduce((sum, part) => sum + part.cents, 0)).toBe(1000);
  });

  it("weights the split by unit count", () => {
    const parts = previewPackSplit(
      {
        contents: [
          { productId: "a", units: 30 },
          { productId: "b", units: 10 },
        ],
      },
      "1",
      "40.00",
    );
    expect(parts?.map((part) => part.cents)).toEqual([3000, 1000]);
  });

  it("returns null while the row is still incomplete", () => {
    expect(previewPackSplit(single, "", "30.00")).toBeNull();
    expect(previewPackSplit(single, "1", "")).toBeNull();
    expect(previewPackSplit(single, "0", "30.00")).toBeNull();
    expect(previewPackSplit(undefined, "1", "30.00")).toBeNull();
  });

  it("handles a zero-cost line rather than refusing it", () => {
    expect(previewPackSplit(single, "1", "0")).toEqual([
      { productId: "coke", units: 24, cents: 0 },
    ]);
  });
});
