import { describe, expect, test } from "bun:test";
import { countMeterFor, isSlotMatch, shelfLabel } from "./machineMap.ts";

describe("shelfLabel", () => {
  test("uses the letters a lettered shelf's codes start with", () => {
    expect(shelfLabel(["A0", "A2", "A4"], 0)).toBe("A");
  });

  test("upper-cases lowercase codes", () => {
    expect(shelfLabel(["d1", "d2"], 3)).toBe("D");
  });

  test("falls back to the shelf number for numeric codes", () => {
    expect(shelfLabel(["10", "11", "12"], 0)).toBe("1");
    expect(shelfLabel(["20", "21"], 1)).toBe("2");
  });

  test("falls back to the shelf number for an empty shelf", () => {
    expect(shelfLabel([], 2)).toBe("3");
  });
});

describe("isSlotMatch", () => {
  const slotCodes = new Set(["D5", "D6", "B4"]);

  test("an exact slot code matches only that slot", () => {
    expect(
      isSlotMatch({ slotCode: "D5", searchText: "Twix", query: "d5", slotCodes }),
    ).toBe(true);
    expect(
      isSlotMatch({
        slotCode: "B4",
        searchText: "D5 Energy Shot",
        query: "D5",
        slotCodes,
      }),
    ).toBe(false);
  });

  test("a product word matches any slot holding it", () => {
    expect(
      isSlotMatch({
        slotCode: "B4",
        searchText: "Twix Caramel",
        query: "twix",
        slotCodes,
      }),
    ).toBe(true);
  });

  test("a partial code matches the whole row", () => {
    expect(
      isSlotMatch({ slotCode: "D6", searchText: "Fritos", query: "D", slotCodes }),
    ).toBe(true);
  });

  test("a word that isn't there doesn't match", () => {
    expect(
      isSlotMatch({ slotCode: "B4", searchText: "Sun Chips", query: "twix", slotCodes }),
    ).toBe(false);
  });
});

describe("countMeterFor", () => {
  test("a well-stocked slot is a green, partly filled meter", () => {
    expect(countMeterFor({ found: 6, par: 10 })).toEqual({ meter: 0.6, tone: "success" });
  });

  test("30% of par is low", () => {
    expect(countMeterFor({ found: 3, par: 10 })).toEqual({ meter: 0.3, tone: "warning" });
  });

  test("just over 30% is still stocked", () => {
    expect(countMeterFor({ found: 4, par: 10 }).tone).toBe("success");
  });

  test("an empty slot is danger with an empty meter", () => {
    expect(countMeterFor({ found: 0, par: 10 })).toEqual({ meter: 0, tone: "danger" });
  });

  test("a slot with no par still reads its count, with no meter fill", () => {
    expect(countMeterFor({ found: 5, par: 0 })).toEqual({ meter: 0, tone: "success" });
  });
});
