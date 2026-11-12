import { describe, expect, test } from "bun:test";
import { isReceiptMismatch, linesTotalFor, spentCentsFor } from "./purchaseTotals.ts";

const purchase = (lineCents: number[], receiptTotalCents: number | null = null) => ({
  lines: lineCents.map((totalCostCents) => ({ totalCostCents })),
  receiptTotalCents,
});

test("linesTotalFor adds the lines", () => {
  expect(linesTotalFor(purchase([1299, 501]))).toBe(1800);
});

describe("isReceiptMismatch", () => {
  test("is false with no receipt total", () => {
    expect(isReceiptMismatch(purchase([1800]))).toBe(false);
  });

  test("is false when the lines match the receipt", () => {
    expect(isReceiptMismatch(purchase([1299, 501], 1800))).toBe(false);
  });

  test("is true when they don't", () => {
    expect(isReceiptMismatch(purchase([1299], 1800))).toBe(true);
  });
});

test("spentCentsFor sums every purchase", () => {
  expect(spentCentsFor([purchase([1000, 250]), purchase([599])])).toBe(1849);
});
