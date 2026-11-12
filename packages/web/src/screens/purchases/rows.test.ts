import { describe, expect, test } from "bun:test";
import {
  buildPurchaseLines,
  differenceLabelFor,
  isRowComplete,
  missingPartsOf,
  newPackRow,
  newUnitRow,
  perUnitCentsFor,
  receiptCheckFor,
  type Row,
  rowsSummaryFor,
  unitsIn,
} from "./rows.ts";

const unit = (patch: Partial<Row> = {}): Row =>
  ({ ...newUnitRow("coke"), units: "24", totalCost: "15.99", ...patch }) as Row;
const pack = (patch: Partial<Row> = {}): Row =>
  ({ ...newPackRow("coke-35"), qty: "2", totalCost: "35.98", ...patch }) as Row;

describe("isRowComplete", () => {
  test("a product, a count and a total is complete", () => {
    expect(isRowComplete(unit())).toBe(true);
    expect(isRowComplete(pack())).toBe(true);
  });

  test("a blank count, a zero count or a bad total is not", () => {
    expect(isRowComplete(unit({ units: "" }))).toBe(false);
    expect(isRowComplete(pack({ qty: "0" }))).toBe(false);
    expect(isRowComplete(unit({ totalCost: "abc" }))).toBe(false);
  });

  test("a row still waiting for its product or pack is not", () => {
    expect(isRowComplete({ ...newUnitRow(""), units: "3", totalCost: "1" })).toBe(false);
    expect(isRowComplete({ ...newPackRow(""), totalCost: "1" })).toBe(false);
  });

  test("a new pack row starts at 1 pack, so it only needs its total", () => {
    expect(isRowComplete({ ...newPackRow("coke-35"), totalCost: "17.99" })).toBe(true);
  });
});

describe("missingPartsOf", () => {
  test("names each part a row still needs", () => {
    expect(missingPartsOf({ ...newUnitRow(""), totalCost: "1" })).toEqual({
      isRecordMissing: true,
      isCountMissing: true,
      isTotalMissing: false,
    });
    expect(missingPartsOf(pack({ totalCost: "" }))).toEqual({
      isRecordMissing: false,
      isCountMissing: false,
      isTotalMissing: true,
    });
  });
});

describe("buildPurchaseLines", () => {
  test("splits rows into unit lines and pack lines, in cents", () => {
    const editedRow = { ...unit(), packId: "coke-35" } as Row;
    expect(buildPurchaseLines([unit(), pack(), editedRow])).toEqual({
      status: "ready",
      lines: [
        { productId: "coke", units: 24, totalCostCents: 1599, packId: null },
        { productId: "coke", units: 24, totalCostCents: 1599, packId: "coke-35" },
      ],
      packLines: [{ packId: "coke-35", qty: 2, totalCostCents: 3598 }],
    });
  });

  test("reports the first problem by line number, cost first", () => {
    expect(buildPurchaseLines([unit(), unit({ totalCost: "" })])).toEqual({
      status: "invalid",
      message: "Line 2: cost must be a dollar amount",
    });
    expect(buildPurchaseLines([unit({ units: "0" })])).toEqual({
      status: "invalid",
      message: "Line 1: pick a product and how many units",
    });
    expect(buildPurchaseLines([{ ...newPackRow(""), totalCost: "5" }])).toEqual({
      status: "invalid",
      message: "Line 1: pick a pack and how many",
    });
  });

  test("an empty purchase asks for a first item", () => {
    expect(buildPurchaseLines([])).toEqual({
      status: "invalid",
      message: "Scan a barcode or add an item to get started",
    });
  });
});

describe("unitsIn and perUnitCentsFor", () => {
  test("units are the count for an item and count × pack size for a pack", () => {
    expect(unitsIn(unit(), { unitsPerPack: 1 })).toBe(24);
    expect(unitsIn(pack(), { unitsPerPack: 35 })).toBe(70);
  });

  test("per unit divides the total across those units, to the cent", () => {
    expect(perUnitCentsFor(unit(), { unitsPerPack: 1 })).toBe(67);
    expect(perUnitCentsFor(pack(), { unitsPerPack: 35 })).toBe(51);
  });

  test("nothing per unit until both the count and the total are in", () => {
    expect(perUnitCentsFor(unit({ units: "" }), { unitsPerPack: 1 })).toBeNull();
    expect(perUnitCentsFor(unit({ totalCost: "" }), { unitsPerPack: 1 })).toBeNull();
  });
});

describe("rowsSummaryFor", () => {
  test("counts rows, the incomplete ones, and the totals entered so far", () => {
    const rows = [unit(), pack(), unit({ units: "", totalCost: "" })];

    expect(rowsSummaryFor(rows)).toEqual({
      rowCount: 3,
      incompleteCount: 1,
      totalCents: 1599 + 3598,
    });
  });
});

describe("receiptCheckFor", () => {
  test("nothing to compare until a receipt total is entered", () => {
    expect(receiptCheckFor({ itemsCents: 8746, receiptTotal: "" })).toEqual({ status: "none" });
    expect(receiptCheckFor({ itemsCents: 8746, receiptTotal: "abc" })).toEqual({ status: "none" });
  });

  test("equal totals match", () => {
    expect(receiptCheckFor({ itemsCents: 9000, receiptTotal: "90" })).toEqual({
      status: "matches",
      receiptCents: 9000,
    });
  });

  test("items under or over the receipt, by how much", () => {
    expect(receiptCheckFor({ itemsCents: 8746, receiptTotal: "90.00" })).toEqual({
      status: "mismatch",
      receiptCents: 9000,
      differenceCents: 254,
      isOver: false,
    });
    expect(receiptCheckFor({ itemsCents: 9100, receiptTotal: "90" })).toMatchObject({
      differenceCents: 100,
      isOver: true,
    });
  });
});

describe("differenceLabelFor", () => {
  test("says how far off and which way", () => {
    expect(
      differenceLabelFor({ status: "mismatch", receiptCents: 9000, differenceCents: 254, isOver: false }),
    ).toBe("$2.54 under");
    expect(
      differenceLabelFor({ status: "mismatch", receiptCents: 9000, differenceCents: 100, isOver: true }),
    ).toBe("$1.00 over");
  });
});
