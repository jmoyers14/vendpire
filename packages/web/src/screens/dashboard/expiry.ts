import { formatShortDate, middayInstantFor } from "../../utils/dates.ts";

export interface BestBy {
  /** "Expired Nov 2", "Nov 12 · today", "Nov 13 · tomorrow" or "Nov 20 · in 8 days". */
  label: string;
  isExpired: boolean;
}

/** `bestBy` is a calendar day (YYYY-MM-DD), read on the local calendar so it doesn't slip a day. */
export const bestByFor = ({
  bestBy,
  daysUntil,
  now,
}: {
  bestBy: string;
  daysUntil: number;
  now?: Date;
}): BestBy => {
  const day = formatShortDate(middayInstantFor(bestBy), { now });
  if (daysUntil < 0) {
    return { label: `Expired ${day}`, isExpired: true };
  }
  if (daysUntil === 0) {
    return { label: `${day} · today`, isExpired: false };
  }
  if (daysUntil === 1) {
    return { label: `${day} · tomorrow`, isExpired: false };
  }
  return { label: `${day} · in ${daysUntil} days`, isExpired: false };
};
