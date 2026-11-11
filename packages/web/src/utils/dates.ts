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
