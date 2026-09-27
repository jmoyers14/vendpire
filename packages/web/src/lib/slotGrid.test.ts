import { describe, expect, it } from "bun:test";
import {
  buildRows,
  parseSlotLines,
  rowsToShelves,
  rowsToSlotCodes,
  shelvesToRows,
} from "./slotGrid.ts";

describe("slotGrid", () => {
  it("generates codes in walking order", () => {
    expect(rowsToSlotCodes(buildRows(2, 3))).toEqual([
      "A1", "A2", "A3", "B1", "B2", "B3",
    ]);
  });

  it("rowsToShelves keeps the shelf structure", () => {
    expect(
      rowsToShelves([
        { letter: "A", columns: 2, start: 1, step: 1 },
        { letter: "B", columns: 3, start: 0, step: 2 },
      ]),
    ).toEqual([["A1", "A2"], ["B0", "B2", "B4"]]);
  });

  it("round-trips shelves back into rows, inferring numbering", () => {
    const rows = [
      { letter: "A", columns: 3, start: 0, step: 2 },
      { letter: "B", columns: 2, start: 1, step: 1 },
    ];
    expect(shelvesToRows(rowsToShelves(rows))).toEqual(rows);
  });

  it("a single-slot shelf defaults to step 1", () => {
    expect(shelvesToRows([["A5"]])).toEqual([
      { letter: "A", columns: 1, start: 5, step: 1 },
    ]);
  });

  it("returns null for shelves that don't fit the grid pattern", () => {
    expect(shelvesToRows([["A1", "A2", "A4"]])).toBeNull(); // uneven gaps
    expect(shelvesToRows([["B1", "B2"]])).toBeNull();       // doesn't start at A
    expect(shelvesToRows([["A1"], ["A2"]])).toBeNull();     // second shelf must be B
    expect(shelvesToRows([["LEFT"]])).toBeNull();           // not letter+number
    expect(shelvesToRows([])).toBeNull();
    expect(shelvesToRows([[]])).toBeNull();
  });

  it("parses manual text one shelf per line", () => {
    expect(parseSlotLines("A0 A2, A4\n\nB1 B2")).toEqual([
      ["A0", "A2", "A4"],
      ["B1", "B2"],
    ]);
  });
});
