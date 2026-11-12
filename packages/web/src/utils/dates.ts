const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * "Nov 3" for an instant this year, "Nov 3, 2025" otherwise, in the browser's
 * time zone. `now` is injectable so tests don't depend on the calendar.
 */
export const formatShortDate = (
  instant: string,
  { now = new Date() }: { now?: Date } = {},
): string => {
  const date = new Date(instant);
  const isThisYear = date.getFullYear() === now.getFullYear();
  return (isThisYear ? MONTH_DAY : MONTH_DAY_YEAR).format(date);
};

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

/** "Oct 29, 8:28 PM": `formatShortDate` plus the time, without seconds. */
export const formatShortDateTime = (
  instant: string,
  { now = new Date() }: { now?: Date } = {},
): string => `${formatShortDate(instant, { now })}, ${TIME.format(new Date(instant))}`;

const pad2 = (value: number): string => String(value).padStart(2, "0");

/**
 * The `YYYY-MM-DD` an <input type="date"> shows for an instant, on the
 * browser's calendar. Not `toISOString().slice(0, 10)`: that's the UTC day,
 * which is already tomorrow on a US evening.
 */
export const dateInputFor = (instant: Date | string): string => {
  const date = new Date(instant);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

/**
 * The instant to store for a picked calendar day: local noon, so the day
 * survives the trip through UTC in any zone within 12 hours of it.
 */
export const middayInstantFor = (dateInput: string): string =>
  new Date(`${dateInput}T12:00:00`).toISOString();
