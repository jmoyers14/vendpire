import { describe, expect, it } from "bun:test";
import {
  buildCatalogItems,
  looksLikeBarcode,
  searchCatalogItems,
} from "./catalogSearch.ts";

const product = (over: Partial<Parameters<typeof buildCatalogItems>[0][0]> = {}) => ({
  id: "p1",
  name: "Coke Zero 12oz",
  upc: null,
  imageUrl: null,
  active: true,
  ...over,
});

const pack = (over: Partial<Parameters<typeof buildCatalogItems>[1][0]> = {}) => ({
  id: "k1",
  name: "Coke Zero — case (24)",
  barcodes: ["10049000042556"],
  contents: [{ productId: "p1", units: 24 }],
  active: true,
  ...over,
});

describe("buildCatalogItems", () => {
  it("puts products and packs in one list, tagged by kind", () => {
    const items = buildCatalogItems([product()], [pack()]);
    expect(items.map((item) => item.kind)).toEqual(["unit", "pack"]);
  });

  it("carries a product's upc and a pack's first barcode", () => {
    const items = buildCatalogItems(
      [product({ upc: "00049000042559" })],
      [pack({ barcodes: ["10049000042556", "20049000042553"] })],
    );
    expect(items[0]?.barcode).toBe("00049000042559");
    expect(items[1]?.barcode).toBe("10049000042556");
  });

  it("reports null barcode for a product that has no code yet", () => {
    expect(buildCatalogItems([product()], [])[0]?.barcode).toBeNull();
  });

  it("totals a pack's units across its contents", () => {
    const items = buildCatalogItems(
      [],
      [
        pack({
          contents: [
            { productId: "p1", units: 12 },
            { productId: "p2", units: 23 },
          ],
        }),
      ],
    );
    expect(items[0]?.units).toBe(35);
  });

  it("leaves out inactive records", () => {
    const items = buildCatalogItems(
      [product({ active: false })],
      [pack({ active: false })],
    );
    expect(items).toEqual([]);
  });
});

describe("searchCatalogItems", () => {
  const items = buildCatalogItems(
    [
      product({ id: "p1", name: "Coke Zero 12oz" }),
      product({ id: "p2", name: "Diet Coke 12oz" }),
      product({ id: "p3", name: "Doritos Nacho Cheese" }),
    ],
    [pack({ id: "k1", name: "Coke Zero — case (24)" })],
  );

  it("returns nothing for an empty query", () => {
    expect(searchCatalogItems(items, "   ")).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(searchCatalogItems(items, "DORITOS").map((item) => item.id)).toEqual([
      "p3",
    ]);
  });

  it("finds products and packs in the same result list", () => {
    const kinds = searchCatalogItems(items, "coke zero").map((item) => item.kind);
    expect(kinds).toContain("unit");
    expect(kinds).toContain("pack");
  });

  it("ranks a leading match above a mid-name one", () => {
    const ids = searchCatalogItems(items, "coke").map((item) => item.id);
    expect(ids.indexOf("p1")).toBeLessThan(ids.indexOf("p2"));
  });

  it("requires every term to match, so extra words narrow", () => {
    expect(searchCatalogItems(items, "coke doritos")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(searchCatalogItems(items, "coke", 1)).toHaveLength(1);
  });
});

describe("looksLikeBarcode", () => {
  it("accepts plain digits", () => {
    expect(looksLikeBarcode("049000042559")).toBe(true);
  });

  it("accepts a code with separators off a receipt", () => {
    expect(looksLikeBarcode("049000-042559")).toBe(true);
    expect(looksLikeBarcode("0 49000 04255 9")).toBe(true);
  });

  it("rejects anything with a letter — that's a person searching", () => {
    expect(looksLikeBarcode("coke")).toBe(false);
    expect(looksLikeBarcode("7up")).toBe(false);
  });

  it("rejects an empty value", () => {
    expect(looksLikeBarcode("   ")).toBe(false);
  });
});
