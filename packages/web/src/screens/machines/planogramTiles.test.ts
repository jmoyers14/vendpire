import { describe, expect, test } from "bun:test";
import { planogramTileFor, slotPositionLabel } from "./planogramTiles.ts";

describe("planogramTileFor", () => {
  test("an empty slot reads as empty", () => {
    expect(planogramTileFor({ slotCode: "A1", entries: [] })).toMatchObject({
      isEmpty: true,
      label: "A1: empty",
    });
  });

  test("shows the front product and the slot's price", () => {
    const tile = planogramTileFor({
      slotCode: "B2",
      entries: [
        { productName: "Doritos", price: "$1.75" },
        { productName: "Cheetos", price: "$1.75" },
      ],
    });
    expect(tile).toMatchObject({
      value: "$1.75",
      productName: "Doritos",
      productCount: 2,
      label: "B2: Doritos, Cheetos · $1.75",
      searchText: "Doritos Cheetos",
    });
  });

  test("a product without a price says so", () => {
    const tile = planogramTileFor({
      slotCode: "C3",
      entries: [{ productName: "Doritos", price: null }],
    });
    expect(tile).toMatchObject({ value: "—", tone: "pending", label: "C3: Doritos · no price" });
  });
});

test("slotPositionLabel names positions only in a shared slot", () => {
  expect(slotPositionLabel({ index: 0, count: 1 })).toBe("");
  expect(slotPositionLabel({ index: 0, count: 2 })).toBe("Front");
  expect(slotPositionLabel({ index: 1, count: 2 })).toBe("Behind");
});
