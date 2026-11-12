import type { ApiPurchase } from "../../apiTypes.ts";
import { centsToInput, formatCents, parseDollarsToCents } from "../../utils/money.ts";

/**
 * One line of the purchase being entered. A row is either a pack (N packs for
 * one total, expanded server-side) or loose units of a single product —
 * whichever the scanned barcode turned out to be.
 *
 * Counts and costs are strings because they back text inputs; they only become
 * numbers on submit.
 */
export interface PackRow {
  kind: "pack";
  packId: string;
  qty: string;
  totalCost: string;
}

export interface UnitRow {
  kind: "unit";
  productId: string;
  units: string;
  totalCost: string;
  /** Provenance preserved when editing an existing purchase. */
  packId: string | null;
}

export type Row = PackRow | UnitRow;

export const isPackRow = (row: Row): row is PackRow => row.kind === "pack";

/** A scanned or picked case is one case until the operator says otherwise. */
export const DEFAULT_PACK_QTY = "1";

/** A stored line, reopened for editing. Stored lines are always per-product. */
export const toUnitRow = (line: ApiPurchase["lines"][number]): UnitRow => ({
  kind: "unit",
  productId: line.productId,
  units: String(line.units),
  totalCost: centsToInput(line.totalCostCents),
  packId: line.packId,
});

/** A blank row for a product — cost and count are filled in from the receipt. */
export const newUnitRow = (productId: string): UnitRow => ({
  kind: "unit",
  productId,
  units: "",
  totalCost: "",
  packId: null,
});

/** A blank row for a case. */
export const newPackRow = (packId: string): PackRow => ({
  kind: "pack",
  packId,
  qty: DEFAULT_PACK_QTY,
  totalCost: "",
});

const countOf = (row: Row): number =>
  Number.parseInt(isPackRow(row) ? row.qty : row.units, 10);

const isCountValid = (count: number): boolean => !Number.isNaN(count) && count >= 1;

/** The product or pack a row is for; empty until one is picked. */
export const recordIdOf = (row: Row): string => (isPackRow(row) ? row.packId : row.productId);

/** What Save still needs from a row: a product or pack, a count of at least 1, and a dollar total. */
export const missingPartsOf = (
  row: Row,
): { isRecordMissing: boolean; isCountMissing: boolean; isTotalMissing: boolean } => ({
  isRecordMissing: recordIdOf(row) === "",
  isCountMissing: !isCountValid(countOf(row)),
  isTotalMissing: parseDollarsToCents(row.totalCost) === null,
});

export const isRowComplete = (row: Row): boolean => {
  const { isRecordMissing, isCountMissing, isTotalMissing } = missingPartsOf(row);
  return !isRecordMissing && !isCountMissing && !isTotalMissing;
};

export interface PurchaseUnitLine {
  productId: string;
  units: number;
  totalCostCents: number;
  packId: string | null;
}

export interface PurchasePackLine {
  packId: string;
  qty: number;
  totalCostCents: number;
}

/**
 * The rows as the lines `purchases.create` and `purchases.update` take, or the
 * first problem in reading order.
 */
export const buildPurchaseLines = (
  rows: readonly Row[],
):
  | { status: "ready"; lines: PurchaseUnitLine[]; packLines: PurchasePackLine[] }
  | { status: "invalid"; message: string } => {
  const lines: PurchaseUnitLine[] = [];
  const packLines: PurchasePackLine[] = [];
  for (const [index, row] of rows.entries()) {
    const totalCostCents = parseDollarsToCents(row.totalCost);
    if (totalCostCents === null) {
      return { status: "invalid", message: `Line ${index + 1}: cost must be a dollar amount` };
    }
    const { isRecordMissing, isCountMissing } = missingPartsOf(row);
    if (isPackRow(row)) {
      if (isRecordMissing || isCountMissing) {
        return { status: "invalid", message: `Line ${index + 1}: pick a pack and how many` };
      }
      packLines.push({ packId: row.packId, qty: countOf(row), totalCostCents });
      continue;
    }
    if (isRecordMissing || isCountMissing) {
      return {
        status: "invalid",
        message: `Line ${index + 1}: pick a product and how many units`,
      };
    }
    lines.push({ productId: row.productId, units: countOf(row), totalCostCents, packId: row.packId });
  }
  if (lines.length === 0 && packLines.length === 0) {
    return { status: "invalid", message: "Scan a barcode or add an item to get started" };
  }
  return { status: "ready", lines, packLines };
};

/** Units a row adds up to; a pack multiplies by the units in one pack. Null while the count is blank. */
export const unitsIn = (row: Row, { unitsPerPack }: { unitsPerPack: number }): number | null => {
  const count = countOf(row);
  if (!isCountValid(count)) {
    return null;
  }
  return isPackRow(row) ? count * unitsPerPack : count;
};

/** What one unit cost, rounded to the cent. Null until the count and total are both in. */
export const perUnitCentsFor = (
  row: Row,
  { unitsPerPack }: { unitsPerPack: number },
): number | null => {
  const units = unitsIn(row, { unitsPerPack });
  const totalCents = parseDollarsToCents(row.totalCost);
  if (units === null || units === 0 || totalCents === null) {
    return null;
  }
  return Math.round(totalCents / units);
};

/** The table footer and save bar: how many rows, how many still incomplete, and their total. */
export const rowsSummaryFor = (
  rows: readonly Row[],
): { rowCount: number; incompleteCount: number; totalCents: number } => ({
  rowCount: rows.length,
  incompleteCount: rows.filter((row) => !isRowComplete(row)).length,
  totalCents: rows.reduce((sum, row) => sum + (parseDollarsToCents(row.totalCost) ?? 0), 0),
});

export type ReceiptCheck =
  | { status: "none" }
  | { status: "matches"; receiptCents: number }
  | { status: "mismatch"; receiptCents: number; differenceCents: number; isOver: boolean };

/**
 * The items entered against the receipt's total, so a missed or mistyped line
 * shows up as "under by $4.20" instead of by re-reading every line. "none"
 * until a receipt total is entered.
 */
export const receiptCheckFor = ({
  itemsCents,
  receiptTotal,
}: {
  itemsCents: number;
  receiptTotal: string;
}): ReceiptCheck => {
  const receiptCents = receiptTotal.trim() === "" ? null : parseDollarsToCents(receiptTotal);
  if (receiptCents === null) {
    return { status: "none" };
  }
  const difference = itemsCents - receiptCents;
  if (difference === 0) {
    return { status: "matches", receiptCents };
  }
  return {
    status: "mismatch",
    receiptCents,
    differenceCents: Math.abs(difference),
    isOver: difference > 0,
  };
};

/** How far off the items are, e.g. "$2.54 under". */
export const differenceLabelFor = (
  check: Extract<ReceiptCheck, { status: "mismatch" }>,
): string => `${formatCents(check.differenceCents)} ${check.isOver ? "over" : "under"}`;
