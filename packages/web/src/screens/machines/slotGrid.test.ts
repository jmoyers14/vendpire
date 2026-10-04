import { describe, expect, it } from "bun:test";
import {
  buildRows,
  parseSlotLines,
  rowsToShelves,
  rowsToSlotCodes,
  shelvesToRows,
  shelvesToSlotsValue,
  type SlotsValue,
  slotsValueToShelves,
  toggleSlotsMode,
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

describe("SlotsValue", () => {
  it("opens grid mode for shelves that fit the pattern", () => {
    const value = shelvesToSlotsValue([["A0", "A2", "A4"], ["B1", "B2"]]);
    expect(value.mode).toBe("grid");
    expect(value.rows).toEqual([
      { letter: "A", columns: 3, start: 0, step: 2 },
      { letter: "B", columns: 2, start: 1, step: 1 },
    ]);
    // Both representations are filled, so the mode toggle can't lose the layout.
    expect(value.codesText).toBe("A0 A2 A4\nB1 B2");
  });

  it("opens custom mode for shelves that don't, keeping the codes", () => {
    const value = shelvesToSlotsValue([["A1", "A2", "A4"]]);
    expect(value.mode).toBe("custom");
    expect(value.codesText).toBe("A1 A2 A4");
    expect(slotsValueToShelves(value)).toEqual([["A1", "A2", "A4"]]);
  });

  it("round-trips either mode back to the same shelves", () => {
    const shelves = [["A0", "A2"], ["B1"]];
    expect(slotsValueToShelves(shelvesToSlotsValue(shelves))).toEqual(shelves);
    const gapped = [["A1", "A2", "A4"]];
    expect(slotsValueToShelves(shelvesToSlotsValue(gapped))).toEqual(gapped);
  });

  it("empty shelves fall back to the default grid", () => {
    const value = shelvesToSlotsValue([]);
    expect(value.mode).toBe("custom");
    expect(value.rows).toEqual(buildRows(6, 8));
    expect(slotsValueToShelves(value)).toEqual([]);
  });

  it("carries the layout across a mode flip", () => {
    const grid = shelvesToSlotsValue([["A0", "A2"]]);
    const custom = toggleSlotsMode(grid);
    expect(custom.mode).toBe("custom");
    expect(custom.codesText).toBe("A0 A2");
    const back = toggleSlotsMode(custom);
    expect(back.mode).toBe("grid");
    expect(back.rows).toEqual(grid.rows);
  });

  it("a mode flip from unparseable text keeps the previous rows", () => {
    const value: SlotsValue = {
      mode: "custom",
      rows: buildRows(2, 2),
      codesText: "LEFT RIGHT",
    };
    expect(toggleSlotsMode(value).rows).toEqual(buildRows(2, 2));
  });
});
