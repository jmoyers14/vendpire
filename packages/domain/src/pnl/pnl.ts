import { cogsForUnits } from "../costs/unitCost.ts";
import type { UnitCost } from "../costs/unitCost.ts";
import type { Cents } from "../types/index.ts";
import type { VisitAnomaly } from "../visits/anomalies.ts";
import { dispositionFor } from "../visits/removals.ts";
import type { RemovalDisposition } from "../visits/removals.ts";
import type { SlotInterval, SlotRemoval } from "../visits/sold.ts";

/**
 * Revenue − COGS, with write-offs reported beside the result rather than hidden
 * inside it. No commission module in v1.
 *
 * "P&L" here means PRODUCT-LEVEL profitability, not a business P&L: there are
 * no operating expenses in v1 — no fuel, labour, or depreciation — so
 * `netProfitCents` is net of the goods you lost, not net of running the route.
 */

export interface IntervalPnlRow {
  readonly interval: SlotInterval;
  /** Zero when sold is unknown — never a guess. */
  readonly revenueCents: Cents;
  /** Null when the cost is unknown, or when there is no sold figure to cost. */
  readonly cogsCents: Cents | null;
}

/**
 * Discriminated on disposition so a returned-to-stock row has NO cost field at
 * all — not a zero, and not a nullable. There is nothing to accidentally add to
 * a loss total, which is what actually enforces `PnlTotals`' promise.
 */
export type RemovalPnlRow =
  | {
      readonly removal: SlotRemoval;
      readonly disposition: "written-off";
      /** Null when the product has no purchase history. */
      readonly costCents: Cents | null;
    }
  | {
      readonly removal: SlotRemoval;
      readonly disposition: "returned-to-stock";
    }
  | {
      /** No reason recorded, so neither a loss nor a transfer. Only counted. */
      readonly removal: SlotRemoval;
      readonly disposition: null;
    };

export interface PnlRows {
  readonly intervals: IntervalPnlRow[];
  readonly removals: RemovalPnlRow[];
}

export interface PnlTotals {
  readonly revenueCents: Cents;
  /** SOLD units only. Null if ANY costed row is unknown — never a partial sum. */
  readonly cogsCents: Cents | null;
  /** revenue − COGS. How the route performed, ignoring waste. */
  readonly grossProfitCents: Cents | null;
  /** Write-offs at cost: expired, damaged, recalled. */
  readonly writeOffCents: Cents | null;
  readonly writeOffUnits: number;
  /**
   * Destocked and transferred. Units only, deliberately with NO cost figure —
   * those units are still yours and their COGS lands wherever they sell.
   */
  readonly returnedToStockUnits: number;
  /** revenue − COGS − write-offs. The honest bottom line. */
  readonly netProfitCents: Cents | null;
  readonly unknownSoldRows: number;
  readonly unknownCostRows: number;
  readonly unknownRemovalReasonRows: number;
}

const dispositionOf = (
  removal: SlotRemoval,
): RemovalDisposition | null =>
  removal.reason === null ? null : dispositionFor(removal.reason);

/**
 * Price every interval and cost every removal.
 *
 * `unknown-cost` is reported once per product rather than once per row — the
 * same product can occupy a dozen slots, and a dozen identical warnings is how
 * an anomaly list gets ignored.
 */
export const buildIntervalPnl = (
  intervals: readonly SlotInterval[],
  removals: readonly SlotRemoval[],
  costBasis: ReadonlyMap<string, UnitCost>,
): { rows: PnlRows; anomalies: VisitAnomaly[] } => {
  const anomalies: VisitAnomaly[] = [];
  const reportedUnknownCost = new Set<string>();

  const reportUnknownCost = (productId: string): void => {
    if (reportedUnknownCost.has(productId)) {
      return;
    }
    reportedUnknownCost.add(productId);
    anomalies.push({ kind: "unknown-cost", productId });
  };

  const intervalRows = intervals.map((interval): IntervalPnlRow => {
    if (interval.sold.status === "unknown") {
      return { interval, revenueCents: 0, cogsCents: null };
    }

    const units = interval.sold.units;
    const cogs = cogsForUnits(units, costBasis.get(interval.productId));
    if (cogs.status === "unknown") {
      reportUnknownCost(interval.productId);
      return {
        interval,
        revenueCents: units * interval.priceCents,
        cogsCents: null,
      };
    }
    return {
      interval,
      revenueCents: units * interval.priceCents,
      cogsCents: cogs.cogsCents,
    };
  });

  const removalRows = removals.map((removal): RemovalPnlRow => {
    const disposition = dispositionOf(removal);
    if (disposition === null) {
      return { removal, disposition: null };
    }
    if (disposition === "returned-to-stock") {
      return { removal, disposition };
    }

    const cogs = cogsForUnits(removal.units, costBasis.get(removal.productId));
    if (cogs.status === "unknown") {
      reportUnknownCost(removal.productId);
      return { removal, disposition, costCents: null };
    }
    return { removal, disposition, costCents: cogs.cogsCents };
  });

  return {
    rows: { intervals: intervalRows, removals: removalRows },
    anomalies,
  };
};

const minus = (a: Cents | null, b: Cents | null): Cents | null =>
  a === null || b === null ? null : a - b;

/**
 * Roll rows up into one set of figures.
 *
 * No anomalies come out of here: nothing becomes knowable at summary time that
 * wasn't already reported by `intervalsForMachine` or `buildIntervalPnl`, and
 * the `unknown*Rows` counts carry what the UI needs to explain a null.
 */
export const buildPnlTotals = (rows: PnlRows): PnlTotals => {
  let revenueCents = 0;
  let cogsCents: Cents | null = 0;
  let unknownSoldRows = 0;
  let unknownCostRows = 0;

  for (const row of rows.intervals) {
    revenueCents += row.revenueCents;

    if (row.interval.sold.status === "unknown") {
      unknownSoldRows += 1;
      continue;
    }
    if (row.cogsCents === null) {
      unknownCostRows += 1;
      // One unknown row poisons the sum: a partially-known COGS reported as a
      // number yields confidently wrong profit.
      cogsCents = null;
      continue;
    }
    if (cogsCents !== null) {
      cogsCents += row.cogsCents;
    }
  }

  let writeOffCents: Cents | null = 0;
  let writeOffUnits = 0;
  let returnedToStockUnits = 0;
  let unknownRemovalReasonRows = 0;

  for (const row of rows.removals) {
    if (row.disposition === null) {
      unknownRemovalReasonRows += 1;
      // Loss or transfer is a coin flip without the reason, and guessing either
      // overstates the loss or hides it.
      writeOffCents = null;
      continue;
    }
    if (row.disposition === "returned-to-stock") {
      returnedToStockUnits += row.removal.units;
      continue;
    }

    writeOffUnits += row.removal.units;
    if (row.costCents === null) {
      writeOffCents = null;
      continue;
    }
    if (writeOffCents !== null) {
      writeOffCents += row.costCents;
    }
  }

  const grossProfitCents = minus(revenueCents, cogsCents);

  return {
    revenueCents,
    cogsCents,
    grossProfitCents,
    writeOffCents,
    writeOffUnits,
    returnedToStockUnits,
    netProfitCents: minus(grossProfitCents, writeOffCents),
    unknownSoldRows,
    unknownCostRows,
    unknownRemovalReasonRows,
  };
};
