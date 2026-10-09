/**
 * The visit's `countedAt` and the `<input type="datetime-local">` that edits
 * it.
 *
 * The input speaks LOCAL wall-clock with no zone; the API takes an ISO instant
 * with an offset. Both conversions live here so no screen does zone arithmetic
 * inline — the same reason `purchases/dateRange.ts` exists.
 *
 * Minute precision throughout. `countedAt` orders every interval the engine
 * computes, and nobody standing at a machine knows the second.
 */

const pad = (value: number): string => String(value).padStart(2, "0");

/** Local `YYYY-MM-DDTHH:mm`, which is what `datetime-local` expects. */
export const toLocalDateTimeInput = (iso: string): string => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return "";
  }
  const date = [at.getFullYear(), pad(at.getMonth() + 1), pad(at.getDate())];
  return `${date.join("-")}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

/**
 * The exact shape `datetime-local` emits. Seconds are optional because some
 * browsers include them once a step is set.
 */
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * A `datetime-local` value as an ISO instant, or null while it's empty or
 * half-typed — the operator is mid-edit, not in error.
 *
 * The shape is checked BEFORE parsing, and that guard is load-bearing in two
 * ways. `new Date` doesn't reject a partial value — `new Date("2026-10-")`
 * returns October 1st rather than an invalid date — and it reads a date-ONLY
 * string as UTC while reading a date-TIME string as local. So a value the
 * operator hadn't finished typing would not merely slip through, it would
 * land shifted by the zone offset.
 *
 * A full value carries no zone suffix, so `new Date` reads it in the browser's
 * zone. That's the intent: you typed the time you were standing there.
 */
export const localDateTimeToIso = (value: string): string | null => {
  const trimmed = value.trim();
  if (!LOCAL_DATE_TIME.test(trimmed)) {
    return null;
  }
  const at = new Date(trimmed);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};
