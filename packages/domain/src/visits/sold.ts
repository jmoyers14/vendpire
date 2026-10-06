import type { Cents } from "../types/index.ts";
import type { VisitAnomaly } from "./anomalies.ts";
import type { RemovalReason } from "./removals.ts";
import type { UnknownSoldReason, VisitLine, VisitObservation } from "./types.ts";

/**
 * Units sold over one interval for one (slotCode, productId) key.
 *
 * `units` MAY BE NEGATIVE — stock added outside a visit, or a miscount. It is
 * never clamped: a −2 followed by a +14 still sums to the true 12, where
 * clamping to zero would permanently overstate.
 */
export type SoldUnits =
  | { readonly status: "known"; readonly units: number }
  | { readonly status: "unknown"; readonly reason: UnknownSoldReason };

export interface SlotInterval {
  readonly slotCode: string;
  readonly productId: string;
  /** The opening visit's `countedAt`. Equals `to` on a first-visit interval. */
  readonly from: string;
  /** The closing visit's `countedAt`. */
  readonly to: string;
  readonly sold: SoldUnits;
  /**
   * The PREVIOUS visit's line price — what the slot was selling at between the
   * two visits. Carried on the interval rather than looked up, because reaching
   * for the current price here is the easiest bug in the system to write.
   *
   * On a first-visit interval this is the current line's price; that interval
   * carries no sold figure, so the value is informational only.
   */
  readonly priceCents: Cents;
  /** The par in effect at the fill that opened this interval. */
  readonly parAtFill: number | null;
}

/**
 * Units that left a slot without being sold. A property of a VISIT, not of an
 * interval — it happens at the boundary. Returned separately so a removal on a
 * machine's last visit isn't dropped for want of a following interval.
 */
export interface SlotRemoval {
  readonly slotCode: string;
  readonly productId: string;
  readonly visitId: string;
  readonly countedAt: string;
  readonly units: number;
  /** Null is a data defect, reported as `unknown-removal-reason`. */
  readonly reason: RemovalReason | null;
}

/**
 * How full the slot was when you walked away — the level the next interval
 * draws down from. Exported because capture and history screens want to show
 * "filled to 10" without re-deriving it.
 */
export const levelAfter = (line: VisitLine): number =>
  line.remaining - line.removedUnits + line.added;

/** NUL-joined so no slot code or product id can forge another key. */
const keyOf = (line: VisitLine): string =>
  `${line.slotCode}\u0000${line.productId}`;

const firstVisitInterval = (line: VisitLine, countedAt: string): SlotInterval => ({
  slotCode: line.slotCode,
  productId: line.productId,
  from: countedAt,
  to: countedAt,
  sold: { status: "unknown", reason: "first-visit" },
  priceCents: line.priceCents,
  parAtFill: line.par,
});

const noBaseline = (line: VisitLine): VisitAnomaly => ({
  kind: "no-baseline",
  slotCode: line.slotCode,
  productId: line.productId,
  reason: "first-visit",
});

/**
 * Diff two consecutive visits to one machine. Anomalies returned here are
 * diff-derived only; single-visit line checks (over-par, over-removed) belong
 * to `intervalsForMachine`, which sees every visit exactly once.
 *
 * Pass `previous: null` for the machine's earliest visit.
 *
 * Takes an object rather than two positional visits: both arguments are the
 * same type, so a transposition typechecks, produces plausible-looking numbers,
 * and silently inverts the arithmetic.
 */
export const diffVisits = ({
  previous,
  current,
}: {
  previous: VisitObservation | null;
  current: VisitObservation;
}): { intervals: SlotInterval[]; anomalies: VisitAnomaly[] } => {
  if (!previous) {
    return {
      intervals: current.lines.map((line) =>
        firstVisitInterval(line, current.countedAt),
      ),
      anomalies: current.lines.map(noBaseline),
    };
  }

  const intervals: SlotInterval[] = [];
  const anomalies: VisitAnomaly[] = [];

  const priorByKey = new Map<string, VisitLine>();
  for (const line of previous.lines) {
    priorByKey.set(keyOf(line), line);
  }
  const currentKeys = new Set(current.lines.map(keyOf));
  const currentSlots = new Set(current.lines.map((line) => line.slotCode));

  for (const line of current.lines) {
    const prior = priorByKey.get(keyOf(line));
    if (!prior) {
      intervals.push(firstVisitInterval(line, current.countedAt));
      anomalies.push(noBaseline(line));
      continue;
    }

    const units = levelAfter(prior) - line.remaining;
    intervals.push({
      slotCode: line.slotCode,
      productId: line.productId,
      from: previous.countedAt,
      to: current.countedAt,
      sold: { status: "known", units },
      priceCents: prior.priceCents,
      parAtFill: prior.par,
    });
    if (units < 0) {
      anomalies.push({
        kind: "negative-sold",
        slotCode: line.slotCode,
        productId: line.productId,
        units,
      });
    }
  }

  for (const [key, prior] of priorByKey) {
    if (currentKeys.has(key)) {
      continue;
    }

    const unaccountedUnits = levelAfter(prior);
    // The slot was emptied on purpose, so the position closed rather than going
    // uncounted. Emitting an interval here would put a sold-nothing row on this
    // visit and every visit after it, forever.
    if (unaccountedUnits === 0) {
      continue;
    }

    // A missing line is NEVER remaining = 0. Treating it as zero would book the
    // whole leftover as sold and invent revenue out of nothing.
    const reason: UnknownSoldReason = currentSlots.has(prior.slotCode)
      ? "product-changed"
      : "slot-not-counted";

    intervals.push({
      slotCode: prior.slotCode,
      productId: prior.productId,
      from: previous.countedAt,
      to: current.countedAt,
      sold: { status: "unknown", reason },
      priceCents: prior.priceCents,
      parAtFill: prior.par,
    });

    if (reason === "product-changed") {
      anomalies.push({
        kind: "product-changed",
        slotCode: prior.slotCode,
        productId: prior.productId,
        unaccountedUnits,
      });
      continue;
    }
    anomalies.push({
      kind: "slot-not-counted",
      slotCode: prior.slotCode,
      productId: prior.productId,
    });
  }

  return { intervals, anomalies };
};

/** Checks that need only one visit: what left the slot, and what looks wrong. */
const observationsOf = (
  visit: VisitObservation,
): { removals: SlotRemoval[]; anomalies: VisitAnomaly[] } => {
  const removals: SlotRemoval[] = [];
  const anomalies: VisitAnomaly[] = [];

  for (const line of visit.lines) {
    if (line.removedUnits > 0) {
      removals.push({
        slotCode: line.slotCode,
        productId: line.productId,
        visitId: visit.id,
        countedAt: visit.countedAt,
        units: line.removedUnits,
        reason: line.removedReason,
      });

      if (line.removedReason === null) {
        anomalies.push({
          kind: "unknown-removal-reason",
          slotCode: line.slotCode,
          productId: line.productId,
          units: line.removedUnits,
        });
      }
      if (line.removedUnits > line.remaining) {
        anomalies.push({
          kind: "over-removed",
          slotCode: line.slotCode,
          productId: line.productId,
          remaining: line.remaining,
          removedUnits: line.removedUnits,
        });
      }
    }

    // Against the level AFTER removals — found 5, binned 2, added 5 ends at 8,
    // so a naive `remaining + added` would warn about a slot sitting at par.
    const level = levelAfter(line);
    if (line.par !== null && level > line.par) {
      anomalies.push({
        kind: "over-par",
        slotCode: line.slotCode,
        productId: line.productId,
        level,
        par: line.par,
      });
    }
  }

  return { removals, anomalies };
};

const compareStrings = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

/**
 * Total order by (countedAt, createdAt, id).
 *
 * Ordered by `countedAt` — when you stood at the machine — never by arrival: an
 * offline visit counted at 9am can reach the server after one counted at 2pm,
 * and sorting by arrival would make the later visit the earlier one's baseline.
 *
 * Compared as instants rather than strings because the write contract accepts
 * any ISO-8601 offset, and "02:00-08:00" sorts before "09:00+00:00"
 * lexicographically while falling an hour after it in real time.
 */
const byVisitOrder = (a: VisitObservation, b: VisitObservation): number => {
  const counted = Date.parse(a.countedAt) - Date.parse(b.countedAt);
  if (counted !== 0) {
    return counted;
  }
  const created = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (created !== 0) {
    return created;
  }
  return compareStrings(a.id, b.id);
};

/**
 * Every interval, removal, and anomaly for one machine's visit sequence.
 * Sorts defensively, so callers need not pre-order.
 *
 * FOR A DATE-RANGE REPORT: pass the visit at-or-before the range start as a
 * baseline (as `findByMachineAscending` does), then keep intervals whose `to`
 * falls inside the range. The baseline visit has no predecessor here, so its
 * own keys come back as `first-visit` and would otherwise inflate
 * `unknownSoldRows` by the whole machine face.
 *
 * Filter on `to` and NOT on `from === to`: a product introduced mid-period is
 * also `from === to`, and dropping those hides the new products a period report
 * exists to mention.
 */
export const intervalsForMachine = (
  visits: readonly VisitObservation[],
): {
  intervals: SlotInterval[];
  removals: SlotRemoval[];
  anomalies: VisitAnomaly[];
} => {
  const ordered = [...visits].sort(byVisitOrder);
  const intervals: SlotInterval[] = [];
  const removals: SlotRemoval[] = [];
  const anomalies: VisitAnomaly[] = [];

  ordered.forEach((visit, index) => {
    const diff = diffVisits({
      previous: index === 0 ? null : ordered[index - 1],
      current: visit,
    });
    intervals.push(...diff.intervals);
    anomalies.push(...diff.anomalies);

    const observed = observationsOf(visit);
    removals.push(...observed.removals);
    anomalies.push(...observed.anomalies);
  });

  return { intervals, removals, anomalies };
};
