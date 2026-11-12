import { formatShortDate, middayInstantFor } from "../../utils/dates.ts";

/**
 * "Expired Nov 2", "Today", "Tomorrow", or "Nov 20 · in 3 days". `bestBy` is a
 * calendar day (YYYY-MM-DD), read on the local calendar so it doesn't slip a day.
 */
export const bestByLabelFor = ({
  bestBy,
  daysUntil,
  now,
}: {
  bestBy: string;
  daysUntil: number;
  now?: Date;
}): string => {
  const day = formatShortDate(middayInstantFor(bestBy), { now });
  if (daysUntil < 0) {
    return `Expired ${day}`;
  }
  if (daysUntil === 0) {
    return `${day} · today`;
  }
  if (daysUntil === 1) {
    return `${day} · tomorrow`;
  }
  return `${day} · in ${daysUntil} days`;
};
