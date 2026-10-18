/**
 * Calendar-date arithmetic, shared across the app.
 *
 * A calendar date is "YYYY-MM-DD" and NOT an instant: a date like a best-by or
 * a service-due day has no time and no zone, and storing it as one shifts the
 * day for anyone reading it from a different offset than the device that
 * captured it. Because the spelling is zero-padded and big-endian,
 * lexicographic order IS chronological order, so callers can compare and sort
 * with plain string operators and never parse.
 *
 * Everything here is fixed to UTC. Local-zone arithmetic shifts a date by a day
 * across a DST boundary.
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
