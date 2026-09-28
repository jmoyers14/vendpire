import { describe, expect, it } from "bun:test";
import { gs1CheckDigit, normalizeGtin } from "./gtin.ts";

describe("gs1CheckDigit", () => {
  it("computes known check digits", () => {
    expect(gs1CheckDigit("04900000634")).toBe(6); // Coca-Cola 12oz UPC-A
    expect(gs1CheckDigit("002840004400")).toBe(4); // Cheetos case EAN-13
  });
});

describe("normalizeGtin", () => {
  it("normalizes UPC-A to zero-padded GTIN-14", () => {
    expect(normalizeGtin("049000006346")).toEqual({
      gtin14: "00049000006346",
      format: "upc-a",
      likelyCase: false,
    });
  });

  it("expands UPC-E to UPC-A before validating", () => {
    // 04963406 ↔ 049000006346 (Coca-Cola)
    expect(normalizeGtin("04963406")).toEqual({
      gtin14: "00049000006346",
      format: "upc-e",
      likelyCase: false,
    });
  });

  it("strips separators and spaces", () => {
    expect(normalizeGtin(" 0-49000-00634-6 ")?.gtin14).toBe("00049000006346");
  });

  it("accepts EAN-13 (the zero-padded CSV spelling)", () => {
    expect(normalizeGtin("0028400044004")).toEqual({
      gtin14: "00028400044004",
      format: "ean-13",
      likelyCase: false,
    });
  });

  it("flags native GTIN-14 case codes with indicator 1-8", () => {
    const body = "1002840004400";
    const withCheck = `${body}${(10 - (Array.from(body).reverse().reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0) % 10)) % 10}`;
    expect(normalizeGtin(withCheck)?.likelyCase).toBe(true);
  });

  it("rejects bad check digits and bad lengths", () => {
    expect(normalizeGtin("049000006345")).toBeNull(); // wrong check digit
    expect(normalizeGtin("12345")).toBeNull();
    expect(normalizeGtin("")).toBeNull();
    expect(normalizeGtin("not-a-code")).toBeNull();
  });

  it("equates the two spellings of the same code", () => {
    expect(normalizeGtin("049000006346")?.gtin14).toBe(
      normalizeGtin("0049000006346")?.gtin14,
    );
  });
});
