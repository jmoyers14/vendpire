import { describe, expect, it } from "bun:test";
import { buildRows, rowsToSlotCodes, slotCodesToRows } from "./slotGrid.ts";

describe("slotGrid", () => {
  it("generates codes in walking order", () => {
    expect(rowsToSlotCodes(buildRows(2, 3))).toEqual([
      "A1", "A2", "A3", "B1", "B2", "B3",
    ]);
  });

  it("supports per-row widths", () => {
    const codes = rowsToSlotCodes([
      { letter: "A", columns: 2 },
      { letter: "B", columns: 4 },
    ]);
    expect(codes).toEqual(["A1", "A2", "B1", "B2", "B3", "B4"]);
  });

  it("round-trips codes back into rows", () => {
    const rows = [
      { letter: "A", columns: 8 },
      { letter: "B", columns: 8 },
      { letter: "C", columns: 6 },
    ];
    expect(slotCodesToRows(rowsToSlotCodes(rows))).toEqual(rows);
  });

  it("returns null for codes that don't fit the grid pattern", () => {
    expect(slotCodesToRows(["A1", "A3"])).toBeNull();     // gap
    expect(slotCodesToRows(["B1", "B2"])).toBeNull();     // doesn't start at A
    expect(slotCodesToRows(["LEFT", "RIGHT"])).toBeNull(); // not letter+number
    expect(slotCodesToRows([])).toBeNull();
  });
});
