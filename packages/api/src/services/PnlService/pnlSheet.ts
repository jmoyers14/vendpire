import { buildPnlTotals, type PnlRows } from "@vendpire/domain";
import type {
  PnlSheet,
  PnlSheetItem,
  PnlSheetLocation,
  PnlSheetMachine,
  PnlSheetPulledItem,
} from "./PnlService.ts";

/** Names are null when the record can't be found, even deleted. */
export interface MachinePeriod {
  machineId: string;
  machineName: string | null;
  locationId: string;
  locationName: string | null;
  rows: PnlRows;
}

const UNKNOWN_PRODUCT_NAME = "Unknown product";
const UNKNOWN_MACHINE_NAME = "Unknown machine";
const UNKNOWN_LOCATION_NAME = "Unknown location";

const combinedRows = (all: readonly PnlRows[]): PnlRows => ({
  intervals: all.flatMap((rows) => rows.intervals),
  removals: all.flatMap((rows) => rows.removals),
});

const groupedByProduct = <Row>(
  rows: readonly Row[],
  productIdOf: (row: Row) => string,
): Map<string, Row[]> => {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const productId = productIdOf(row);
    groups.set(productId, [...(groups.get(productId) ?? []), row]);
  }
  return groups;
};

/** Every figure comes from `buildPnlTotals`, so a line and its machine total
 *  follow the same unknown-cost rule. */
const itemsOf = (
  rows: PnlRows,
  productNames: ReadonlyMap<string, string>,
): PnlSheetItem[] => {
  const byProduct = groupedByProduct(
    rows.intervals,
    (row) => row.interval.productId,
  );

  const items: PnlSheetItem[] = [];
  for (const [productId, intervals] of byProduct) {
    const units = intervals.reduce(
      (sum, row) =>
        row.interval.sold.status === "known" ? sum + row.interval.sold.units : sum,
      0,
    );
    if (units === 0) {
      continue;
    }
    const totals = buildPnlTotals({ intervals, removals: [] });
    items.push({
      productId,
      productName: productNames.get(productId) ?? UNKNOWN_PRODUCT_NAME,
      units,
      revenueCents: totals.revenueCents,
      cogsCents: totals.cogsCents,
      grossProfitCents: totals.grossProfitCents,
    });
  }
  return items.sort((a, b) => a.productName.localeCompare(b.productName));
};

const pulledOf = (
  rows: PnlRows,
  productNames: ReadonlyMap<string, string>,
): PnlSheetPulledItem[] => {
  const byProduct = groupedByProduct(
    rows.removals.filter((row) => row.disposition === "written-off"),
    (row) => row.removal.productId,
  );

  return [...byProduct]
    .map(([productId, removals]) => {
      const totals = buildPnlTotals({ intervals: [], removals });
      return {
        productId,
        productName: productNames.get(productId) ?? UNKNOWN_PRODUCT_NAME,
        units: totals.writeOffUnits,
        costCents: totals.writeOffCents,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
};

const machineOf = (
  period: MachinePeriod,
  productNames: ReadonlyMap<string, string>,
): PnlSheetMachine => ({
  machineId: period.machineId,
  machineName: period.machineName ?? UNKNOWN_MACHINE_NAME,
  items: itemsOf(period.rows, productNames),
  pulled: pulledOf(period.rows, productNames),
  totals: buildPnlTotals(period.rows),
});

/** Machines with nothing sold or pulled are left out. */
export const buildPnlSheet = (
  periods: readonly MachinePeriod[],
  productNames: ReadonlyMap<string, string>,
): Pick<PnlSheet, "locations" | "totals"> => {
  const byLocation = new Map<
    string,
    { locationName: string; machines: PnlSheetMachine[]; rows: PnlRows[] }
  >();
  for (const period of periods) {
    const machine = machineOf(period, productNames);
    if (machine.items.length === 0 && machine.pulled.length === 0) {
      continue;
    }
    const bucket = byLocation.get(period.locationId) ?? {
      locationName: period.locationName ?? UNKNOWN_LOCATION_NAME,
      machines: [],
      rows: [],
    };
    bucket.machines.push(machine);
    bucket.rows.push(period.rows);
    byLocation.set(period.locationId, bucket);
  }

  const locations = [...byLocation].map(
    ([locationId, bucket]): PnlSheetLocation => ({
      locationId,
      locationName: bucket.locationName,
      machines: bucket.machines.sort((a, b) =>
        a.machineName.localeCompare(b.machineName),
      ),
      totals: buildPnlTotals(combinedRows(bucket.rows)),
    }),
  );

  return {
    locations: locations.sort((a, b) =>
      a.locationName.localeCompare(b.locationName),
    ),
    totals: buildPnlTotals(
      combinedRows([...byLocation.values()].flatMap((bucket) => bucket.rows)),
    ),
  };
};
