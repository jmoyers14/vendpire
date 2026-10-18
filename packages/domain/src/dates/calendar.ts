/**
 * Calendar-date arithmetic, fixed to UTC — local-zone arithmetic shifts a date
 * by a day across a DST boundary. "YYYY-MM-DD" sorts chronologically as-is, so
 * callers compare with plain string operators rather than parsing.
 */

export type CalendarDate = string;

const MS_PER_DAY = 86_400_000;

const atUtcMidnight = (date: CalendarDate): number =>
  Date.parse(`${date}T00:00:00Z`);

/** The calendar date an instant falls on, in UTC. */
export const calendarDateOf = (instant: Date): CalendarDate =>
  instant.toISOString().slice(0, 10);

/** Reads the wall clock. Callers that need a deterministic day pass one in. */
export const calendarDateToday = (): CalendarDate =>
  calendarDateOf(new Date());

export const calendarDateAfter = (
  date: CalendarDate,
  days: number,
): CalendarDate => {
  const at = new Date(atUtcMidnight(date));
  at.setUTCDate(at.getUTCDate() + days);
  return calendarDateOf(at);
};

/** Negative once the date has passed. */
export const calendarDaysUntil = (
  bestBy: CalendarDate,
  asOf: CalendarDate,
): number =>
  Math.round((atUtcMidnight(bestBy) - atUtcMidnight(asOf)) / MS_PER_DAY);
