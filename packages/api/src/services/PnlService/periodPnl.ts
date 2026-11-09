import {
  buildIntervalPnl,
  intervalsForMachine,
  type PnlRows,
  type UnitCost,
  type VisitAnomaly,
} from "@vendpire/domain";
import type { Visit, VisitRange } from "@vendpire/platform";

/**
 * One machine's priced rows over a window. `visits` is what
 * `findByMachineAscending` returns for the same range: the window plus the
 * last visit before it, which supplies the first interval's baseline and is
 * then taken back out.
 */
export const buildPeriodPnl = ({
  visits,
  range,
  costBasis,
}: {
  visits: readonly Visit[];
  range: VisitRange;
  costBasis: ReadonlyMap<string, UnitCost>;
}): { rows: PnlRows; anomalies: VisitAnomaly[] } => {
  const engine = intervalsForMachine(visits);
  const baseline = baselineOf(visits, range);
  if (baseline === null) {
    return pnlFor(engine, costBasis);
  }

  const opensAfter = Date.parse(baseline.countedAt);
  return pnlFor(
    {
      // On `to`, never on `from === to` — a product introduced mid-period
      // is also from === to, and those are worth reporting.
      intervals: engine.intervals.filter(
        (interval) => Date.parse(interval.to) > opensAfter,
      ),
      removals: engine.removals.filter(
        (removal) => Date.parse(removal.countedAt) > opensAfter,
      ),
      anomalies: withoutAnomaliesOf(engine.anomalies, baseline),
    },
    costBasis,
  );
};

const pnlFor = (
  { intervals, removals, anomalies }: ReturnType<typeof intervalsForMachine>,
  costBasis: ReadonlyMap<string, UnitCost>,
): { rows: PnlRows; anomalies: VisitAnomaly[] } => {
  const pnl = buildIntervalPnl(intervals, removals, costBasis);
  return { rows: pnl.rows, anomalies: [...anomalies, ...pnl.anomalies] };
};

/** The out-of-window baseline, by timestamp and not position — the window's
 *  own first visit must not be mistaken for one. */
const baselineOf = (
  visits: readonly Visit[],
  range: VisitRange,
): Visit | null => {
  const first = visits[0];
  if (!range.from || !first) {
    return null;
  }
  return Date.parse(first.countedAt) < Date.parse(range.from) ? first : null;
};

/** The run's anomalies less the baseline's own. Anomalies carry no timestamp,
 *  so the baseline-alone run is subtracted as a multiset — two slots can raise
 *  the same anomaly. */
const withoutAnomaliesOf = (
  all: VisitAnomaly[],
  baseline: Visit,
): VisitAnomaly[] => {
  const removable = new Map<string, number>();
  for (const anomaly of intervalsForMachine([baseline]).anomalies) {
    const key = JSON.stringify(anomaly);
    removable.set(key, (removable.get(key) ?? 0) + 1);
  }

  return all.filter((anomaly) => {
    const key = JSON.stringify(anomaly);
    const count = removable.get(key) ?? 0;
    if (count === 0) {
      return true;
    }
    removable.set(key, count - 1);
    return false;
  });
};
