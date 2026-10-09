import {
  buildPnlTotals,
  type Cents,
  type PnlRows,
  type PnlTotals,
  type VisitAnomaly,
} from "@vendpire/domain";

/**
 * Regroups a machine's P&L for display — by the visit that CLOSED each
 * interval, which is how an operator reads it ("what happened since I was last
 * here"), and by product, for what sells.
 *
 * Grouping only — every figure comes from the engine's own `buildPnlTotals`,
 * applied to each visit's slice of the rows. Restating the arithmetic here is
 * how a per-visit profit and a period profit come to disagree, and the rule
 * being restated is the subtle one: a single unknown cost poisons the sum
 * rather than being skipped.
 */

export interface VisitPnlGroup {
  readonly visitId: string;
  readonly countedAt: string;
  readonly rows: PnlRows;
  readonly totals: PnlTotals;
}

export interface VisitPnlGrouping {
  /** One per visit, in the order the visits came in (newest first). */
  readonly groups: VisitPnlGroup[];
  /**
   * Intervals whose closing visit isn't in the list. The visit list is capped
   * and the P&L window isn't, so this is reachable — reported rather than
   * silently dropped, because a missing interval reads as a missing sale.
   */
  readonly ungroupedIntervalCount: number;
}

interface VisitLike {
  readonly id: string;
  readonly countedAt: string;
}

/**
 * An interval is identified by the instant it closed, because that's all
 * `SlotInterval` carries — `to` is the closing visit's `countedAt`. Removals
 * carry a `visitId` outright, so they need no such matching.
 */
export const buildVisitPnlGroups = ({
  visits,
  rows,
}: {
  visits: readonly VisitLike[];
  rows: PnlRows;
}): VisitPnlGrouping => {
  // First visit wins a shared instant, so an interval lands in exactly one
  // group even if two visits were somehow counted at the same minute.
  const visitIdByCountedAt = new Map<string, string>();
  for (const visit of visits) {
    if (!visitIdByCountedAt.has(visit.countedAt)) {
      visitIdByCountedAt.set(visit.countedAt, visit.id);
    }
  }

  const intervalsByVisitId = new Map<string, PnlRows["intervals"]>();
  let ungroupedIntervalCount = 0;
  for (const row of rows.intervals) {
    const visitId = visitIdByCountedAt.get(row.interval.to);
    if (visitId === undefined) {
      ungroupedIntervalCount += 1;
      continue;
    }
    const existing = intervalsByVisitId.get(visitId) ?? [];
    existing.push(row);
    intervalsByVisitId.set(visitId, existing);
  }

  const removalsByVisitId = new Map<string, PnlRows["removals"]>();
  for (const row of rows.removals) {
    const existing = removalsByVisitId.get(row.removal.visitId) ?? [];
    existing.push(row);
    removalsByVisitId.set(row.removal.visitId, existing);
  }

  const groups = visits.map((visit): VisitPnlGroup => {
    const slice: PnlRows = {
      intervals: intervalsByVisitId.get(visit.id) ?? [],
      removals: removalsByVisitId.get(visit.id) ?? [],
    };
    return {
      visitId: visit.id,
      countedAt: visit.countedAt,
      rows: slice,
      totals: buildPnlTotals(slice),
    };
  });

  return { groups, ungroupedIntervalCount };
};

/**
 * Why a figure is missing, in words, so a null is never rendered as a number
 * or as a dash the reader has to interpret.
 *
 * ONLY figures that are missing. Not a running commentary on the data — a
 * note here is a problem with an action attached, and anything that fires on
 * a correctly-entered visit does not belong.
 *
 * Deliberately NOT reported here:
 *
 *   - **Unknown sold rows.** Every machine's first visit produces one per
 *     line, by construction, so the note could never be cleared — and a
 *     warning that is always on is furniture. Each unknown interval also
 *     emits its own anomaly (`no-baseline`, `product-changed`,
 *     `slot-not-counted`), which names the slot and says what to do, so this
 *     was a count duplicating a better list.
 *   - **Returned-to-stock units.** Nothing is wrong or missing; those units
 *     are still yours. It is a fact about the period, shown beside the
 *     write-off figure rather than dressed as a warning.
 *
 * Counts PRODUCTS for unknown cost rather than rows: the engine already
 * reports `unknown-cost` once per product, and "2 products" is the actionable
 * number — it's a purchase you haven't logged.
 */
export const buildUnknownNotes = ({
  totals,
  anomalies,
}: {
  totals: PnlTotals;
  anomalies: readonly VisitAnomaly[];
}): string[] => {
  const notes: string[] = [];

  if (totals.cogsCents === null) {
    const products = new Set(
      anomalies
        .filter((anomaly) => anomaly.kind === "unknown-cost")
        .map((anomaly) => anomaly.productId),
    );
    notes.push(
      products.size === 0
        ? "Profit unavailable: some sold units have no purchase history."
        : `Profit unavailable: ${products.size} product(s) have no purchase history. Log the purchase and this fills in by itself.`,
    );
  }

  if (totals.unknownRemovalReasonRows > 0) {
    notes.push(
      `${totals.unknownRemovalReasonRows} removal(s) have no reason recorded, so the write-off total is unavailable: loss and transfer can't be told apart.`,
    );
  }

  return notes;
};

/**
 * One anomaly in plain words. Exhaustive over the union, so adding a kind to
 * the engine is a TypeScript error here rather than a row that renders as
 * nothing.
 *
 * Every sentence says what the engine DID, because none of these are
 * rejections — a visit records what happened in the field, and the engine
 * reports oddities rather than discarding real data.
 */
export const describeAnomaly = (anomaly: VisitAnomaly): string => {
  switch (anomaly.kind) {
    case "negative-sold":
      return `${anomaly.slotCode}: sold came out at ${anomaly.units} — stock was added outside a visit, or a count is off. Reported as-is, never clamped.`;
    case "no-baseline":
      return `${anomaly.slotCode}: no earlier visit to compare against, so this interval has no sold figure.`;
    case "product-changed":
      return `${anomaly.slotCode}: the product changed without the outgoing one being counted out, so ${anomaly.unaccountedUnits} unit(s) are unaccounted for. Record a line with removed = remaining next time and this computes normally.`;
    case "slot-not-counted":
      return `${anomaly.slotCode}: absent from the later visit, so no sale was booked. A missing line is not zero.`;
    case "over-par":
      return `${anomaly.slotCode}: filled to ${anomaly.level} against a par of ${anomaly.par}.`;
    case "over-removed":
      return `${anomaly.slotCode}: ${anomaly.removed} removed but only ${anomaly.remaining} were found.`;
    case "unknown-removal-reason":
      return `${anomaly.slotCode}: ${anomaly.units} unit(s) removed with no reason, so they count as neither a loss nor a transfer.`;
    case "unknown-cost":
      return "A sold product has no purchase history, so its cost is unknown rather than zero.";
  }
};

/**
 * Whether an anomaly belongs in a list the operator reads.
 *
 * `no-baseline` is excluded. It reports only "this position is new, so there is
 * nothing to diff against" — true of every slot on a machine's first visit, and
 * of every newly-filled slot after that. Nothing was done wrong and nothing can
 * be done differently.
 *
 * It is also already reported twice: counted in `totals.unknownSoldRows`, and
 * shown per row as the Sold column's reason. A third copy, one line per slot,
 * is how a list of real problems gets scrolled past.
 *
 * Everything else survives — each one is either a data-entry error or a thing
 * the operator can fix.
 */
export const isActionableAnomaly = (anomaly: VisitAnomaly): boolean =>
  anomaly.kind !== "no-baseline";

/** One product's trade over the window, summed across every slot it occupies. */
export interface ProductSales {
  readonly productId: string;
  /** KNOWN intervals only — see `unknownIntervalCount`. */
  readonly soldUnits: number;
  readonly revenueCents: Cents;
  /** Null if any contributing interval's cost is unknown, matching the rule
   *  `buildPnlTotals` applies to the period. */
  readonly cogsCents: Cents | null;
  readonly profitCents: Cents | null;
  /**
   * Intervals for this product with no sold figure. Excluded from the sums
   * above and counted here, because a product that ranks low on three
   * uncounted intervals is not a product that sells badly — and silently
   * summing those as zero is how "best seller" becomes "best-measured
   * seller".
   */
  readonly unknownIntervalCount: number;
}

/**
 * What each product sold, best revenue first.
 *
 * Mirrors `buildPnlTotals`' loop deliberately: skip unknown-sold rows BEFORE
 * looking at cost, so an interval that has no sold figure cannot poison the
 * product's COGS with the null it carries for that same reason.
 *
 * Removals are not here. This answers "what sells", not "what did I lose".
 */
export const buildProductSales = (rows: PnlRows): ProductSales[] => {
  const byProduct = new Map<
    string,
    {
      soldUnits: number;
      revenueCents: Cents;
      cogsCents: Cents | null;
      unknownIntervalCount: number;
    }
  >();

  for (const row of rows.intervals) {
    const productId = row.interval.productId;
    const running = byProduct.get(productId) ?? {
      soldUnits: 0,
      revenueCents: 0,
      cogsCents: 0 as Cents | null,
      unknownIntervalCount: 0,
    };

    if (row.interval.sold.status === "unknown") {
      running.unknownIntervalCount += 1;
      byProduct.set(productId, running);
      continue;
    }

    running.soldUnits += row.interval.sold.units;
    running.revenueCents += row.revenueCents;
    if (row.cogsCents === null) {
      running.cogsCents = null;
    } else if (running.cogsCents !== null) {
      running.cogsCents += row.cogsCents;
    }
    byProduct.set(productId, running);
  }

  const sales: ProductSales[] = [];
  for (const [productId, totals] of byProduct) {
    sales.push({
      productId,
      soldUnits: totals.soldUnits,
      revenueCents: totals.revenueCents,
      cogsCents: totals.cogsCents,
      profitCents:
        totals.cogsCents === null ? null : totals.revenueCents - totals.cogsCents,
      unknownIntervalCount: totals.unknownIntervalCount,
    });
  }

  // Revenue, not units: the question this answers is which product earns the
  // slot it occupies. Units and profit are shown beside it so a reader can
  // disagree.
  return sales.sort((a, b) => b.revenueCents - a.revenueCents);
};
