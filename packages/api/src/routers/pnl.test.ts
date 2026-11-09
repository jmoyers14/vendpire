import { describe, expect, it } from "bun:test";
import { pnlSheetInput } from "./pnl.ts";

describe("pnlSheetInput", () => {
  it("accepts a month given as local-offset instants", () => {
    const range = {
      from: "2026-10-01T00:00:00.000-05:00",
      to: "2026-10-31T23:59:59.999-05:00",
    };
    expect(pnlSheetInput.parse(range)).toEqual(range);
  });

  it("requires both ends — an open-ended sheet is an all-time scan", () => {
    expect(() =>
      pnlSheetInput.parse({ from: "2026-10-01T00:00:00.000Z" }),
    ).toThrow();
  });

  it("rejects a range that ends before it starts", () => {
    expect(() =>
      pnlSheetInput.parse({
        from: "2026-10-31T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
