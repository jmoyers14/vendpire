import type { ApiPurchase } from "../../apiTypes.ts";
import { centsToInput } from "../../utils/money.ts";

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
