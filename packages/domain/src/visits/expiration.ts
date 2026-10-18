import type { CalendarDate } from "../dates/calendar.ts";
import { levelAfter } from "./sold.ts";
import type { VisitObservation } from "./types.ts";

export interface SlotExpiration {
  readonly slotCode: string;
  readonly productId: string;
  /** Null when no date was recorded. The service buckets those separately. */
  readonly bestBy: CalendarDate | null;
  /** What is in the slot NOW — `levelAfter(line)`, not `remaining`. */
  readonly units: number;
}

/**
 * Every STOCKED slot from one visit, dated or not.
 *
 * Lives here rather than in the service because "what is in the slot now" is
 * `levelAfter` — the same arithmetic the P&L runs on — and putting the
 * skip-empty-slots rule anywhere else would let two places disagree about what
 * "stocked" means. The service keeps everything this cannot know: the product
 * join, `tracksExpiration`, the date window, and the sort.
 *
 * Undated rows are RETURNED, not filtered: they are the sole source for the
 * report's `missingDates` bucket.
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
