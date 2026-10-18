import { levelAfter } from "./sold.ts";
import type { VisitObservation } from "./types.ts";

/**
 * What is in a machine right now, and when it goes bad.
 *
 * The one job here is that nothing past its date is ever sold. Everything is
 * read off the LATEST visit per machine and nothing else: a best-by is a
 * standing fact about a slot's contents, so the most recent observation is the
 * whole answer and the visit sequence is irrelevant. That is deliberate — the
 * richer designs (staleness detection from cumulative sold units, per-lot dated
 * additions) are recorded as rejected in the spec, with their revisit trigger.
 */

/**
 * A calendar date, "YYYY-MM-DD". NOT an instant: "best by Dec 15" has no time
 * and no zone, and storing it as one shifts the day for anyone reading it from
 * a different offset than the device that captured it. Because the spelling is
 * zero-padded and big-endian, lexicographic order IS chronological order, which
 * is what the report sorts and filters on — no parsing in the hot path.
 */
export type CalendarDate = string;

export interface SlotExpiration {
  readonly slotCode: string;
  readonly productId: string;
  /** Null when no date was recorded. The service buckets those separately. */
  readonly bestBy: CalendarDate | null;
  /** What is in the slot NOW — `levelAfter(line)`, not `remaining`. */
  readonly units: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Parsed at UTC midnight, always. Local-zone arithmetic shifts a best-by date
 * by a day across a DST boundary, which is a silent off-by-one in a report
 * whose entire job is to be trusted about dates.
 */
const atUtcMidnight = (date: CalendarDate): number =>
  Date.parse(`${date}T00:00:00Z`);

export const dateAfter = (date: CalendarDate, days: number): CalendarDate => {
  const at = new Date(atUtcMidnight(date));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

/** Negative once the date has passed. */
export const daysUntil = (bestBy: CalendarDate, asOf: CalendarDate): number =>
  Math.round((atUtcMidnight(bestBy) - atUtcMidnight(asOf)) / MS_PER_DAY);

/**
 * Every STOCKED slot from one visit, dated or not.
 *
 * Excludes `levelAfter === 0` only — nothing in the slot, nothing to expire.
 * Undated rows are RETURNED, not filtered: they are the sole source for the
 * report's `missingDates` bucket. Whether a null actually matters depends on
 * `Product.tracksExpiration`, which is product data this package does not take,
 * so that judgement belongs to the service rather than here.
 */
export const expirationsForVisit = (
  visit: VisitObservation,
): SlotExpiration[] => {
  const expirations: SlotExpiration[] = [];
  for (const line of visit.lines) {
    const units = levelAfter(line);
    if (units === 0) {
      continue;
    }
    expirations.push({
      slotCode: line.slotCode,
      productId: line.productId,
      bestBy: line.bestBy,
      units,
    });
  }
  return expirations;
};
