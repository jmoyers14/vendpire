import { describe, expect, test } from "bun:test";
import {
  buildProductInput,
  catalogNameFor,
  categorySuggestionsFor,
  EMPTY_PRODUCT_DRAFT,
  type ProductDraft,
} from "./productForm.ts";

const draftOf = (patch: Partial<ProductDraft>): ProductDraft => ({
  ...EMPTY_PRODUCT_DRAFT,
  name: "7up - 12 oz",
  category: "Soda",
  price: "2.00",
  ...patch,
});

describe("buildProductInput", () => {
  test("a complete draft becomes the API input, trimmed", () => {
    const result = buildProductInput(
      draftOf({ name: "  7up - 12 oz ", upc: " 078000113464 ", taxClass: "" }),
    );

    expect(result).toEqual({
      input: {
        name: "7up - 12 oz",
        category: "Soda",
        upc: "078000113464",
        taxClass: null,
        imageUrl: null,
        defaultPriceCents: 200,
        active: true,
        tracksExpiration: true,
      },
    });
  });

  test("each missing or bad field gets its own error", () => {
    const result = buildProductInput(draftOf({ name: " ", category: "", price: "abc" }));

    expect(result).toEqual({
      errors: {
        name: "Enter a name",
        category: "Enter a category",
        price: "Price must be a dollar amount, e.g. 1.75",
      },
    });
  });

  test("a good price with a missing name still fails", () => {
    expect(buildProductInput(draftOf({ name: "" }))).toEqual({
      errors: { name: "Enter a name" },
    });
  });
});

describe("categorySuggestionsFor", () => {
  test("unique, trimmed and A–Z", () => {
    const products = [
      { category: "Soda" },
      { category: "chips" },
      { category: " Soda " },
      { category: "" },
      { category: "Candy" },
    ];

    expect(categorySuggestionsFor(products)).toEqual(["Candy", "chips", "Soda"]);
  });
});

describe("catalogNameFor", () => {
  test("puts the brand in front of a name that doesn't include it", () => {
    expect(catalogNameFor({ name: "Nacho Cheese 1.75 oz", brand: "Doritos" })).toBe(
      "Doritos Nacho Cheese 1.75 oz",
    );
  });

  test("leaves a name that already says the brand, whatever its case", () => {
    expect(catalogNameFor({ name: "DORITOS Nacho", brand: "Doritos" })).toBe("DORITOS Nacho");
  });

  test("no brand: just the name; no name: null", () => {
    expect(catalogNameFor({ name: "Pretzels", brand: null })).toBe("Pretzels");
    expect(catalogNameFor({ name: null, brand: "Doritos" })).toBeNull();
  });
});
