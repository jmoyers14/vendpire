import { describe, expect, it } from "bun:test";
import { normalizeSlots } from "./slots.ts";

describe("normalizeSlots", () => {
  it("trims and uppercases codes", () => {
    expect(normalizeSlots([[" a1", "b2 "]]).slots).toEqual([["A1", "B2"]]);
  });

  it("drops empty codes and the shelves left empty by them", () => {
    expect(normalizeSlots([["A1", "  ", ""], [], ["   "]]).slots).toEqual([
      ["A1"],
    ]);
  });

  it("reports duplicates across shelves, after normalizing", () => {
    expect(normalizeSlots([["A1", "A2"], ["a1"]]).duplicates).toEqual(["A1"]);
  });

  it("reports a repeated code once, however many times it appears", () => {
    expect(normalizeSlots([["A1", "A1", "A1"]]).duplicates).toEqual(["A1"]);
  });

  it("reports nothing for a clean face", () => {
    expect(normalizeSlots([["A1", "A2"], ["B1"]]).duplicates).toEqual([]);
  });

  it("handles an empty face", () => {
    expect(normalizeSlots([])).toEqual({ slots: [], duplicates: [] });
  });
});
