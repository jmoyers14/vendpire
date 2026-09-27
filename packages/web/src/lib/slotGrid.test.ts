import { describe, expect, it } from "bun:test";
import {
  buildRows,
  groupSlotCodes,
  parseSlotLines,
  rowsToSlotCodes,
  slotCodesToRows,
} from "./slotGrid.ts";

describe("slotGrid", () => {
  it("generates codes in walking order", () => {
    expect(rowsToSlotCodes(buildRows(2, 3))).toEqual([
      "A1", "A2", "A3", "B1", "B2", "B3",
    ]);
  });

  it("supports per-row widths", () => {
    const codes = rowsToSlotCodes([
      { letter: "A", columns: 2, start: 1, step: 1 },
      { letter: "B", columns: 4, start: 1, step: 1 },
    ]);
    expect(codes).toEqual(["A1", "A2", "B1", "B2", "B3", "B4"]);
  });

  it("supports even-only numbering via start + step", () => {
    const codes = rowsToSlotCodes([
      { letter: "A", columns: 4, start: 0, step: 2 },
    ]);
    expect(codes).toEqual(["A0", "A2", "A4", "A6"]);
  });

  it("round-trips plain codes back into rows", () => {
    const rows = [
      { letter: "A", columns: 8, start: 1, step: 1 },
      { letter: "B", columns: 6, start: 1, step: 1 },
    ];
    expect(slotCodesToRows(rowsToSlotCodes(rows))).toEqual(rows);
  });

  it("round-trips even-numbered codes, inferring start and step", () => {
    expect(slotCodesToRows(["A0", "A2", "A4", "B1", "B2"])).toEqual([
      { letter: "A", columns: 3, start: 0, step: 2 },
      { letter: "B", columns: 2, start: 1, step: 1 },
    ]);
  });

  it("a single-slot row defaults to step 1", () => {
    expect(slotCodesToRows(["A5"])).toEqual([
      { letter: "A", columns: 1, start: 5, step: 1 },
    ]);
  });

  it("returns null for codes that don't fit any arithmetic pattern", () => {
    expect(slotCodesToRows(["A1", "A2", "A4"])).toBeNull(); // uneven gaps
    expect(slotCodesToRows(["A2", "A1"])).toBeNull();       // descending
    expect(slotCodesToRows(["B1", "B2"])).toBeNull();       // doesn't start at A
    expect(slotCodesToRows(["LEFT", "RIGHT"])).toBeNull();  // not letter+number
    expect(slotCodesToRows([])).toBeNull();
  });

  it("parses manual text one shelf per line", () => {
    expect(parseSlotLines("A0 A2, A4\n\nB1 B2")).toEqual([
      ["A0", "A2", "A4"],
      ["B1", "B2"],
    ]);
  });

  it("groups flat codes into shelves by consecutive letter prefix", () => {
    expect(groupSlotCodes(["A1", "A2", "A5", "B1", "B2"])).toEqual([
      ["A1", "A2", "A5"],
      ["B1", "B2"],
    ]);
    // A prefix that reappears later starts a NEW shelf (walking order wins).
    expect(groupSlotCodes(["A1", "B1", "A2"])).toEqual([["A1"], ["B1"], ["A2"]]);
    expect(groupSlotCodes([])).toEqual([]);
  });
});
