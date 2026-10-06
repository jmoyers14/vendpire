/**
 * Turns the purchases filter UI's selection into the ISO instants the API
 * filters on.
 *
 * The local-vs-UTC conversion has to happen HERE, in the browser, because
 * PurchaseFormScreen stores every purchase at LOCAL midday — so "purchases on
 * the 5th" is a local-day window, and a server guessing UTC would misfile the
 * edges for anyone far from Greenwich.
 */

export type PresetId = "month" | "90d" | "year" | "all" | "custom";

/** An open-ended instant window. Null on either side means unbounded. */
export interface DateRange {
  from: string | null;
  to: string | null;
}

// No `Z` in the template string, so `new Date` parses it in the browser's zone
// — the same trick PurchaseFormScreen's MIDDAY_SUFFIX already uses.
export const startOfLocalDayIso = (date: string): string =>
  new Date(`${date}T00:00:00`).toISOString();

export const endOfLocalDayIso = (date: string): string =>
  new Date(`${date}T23:59:59.999`).toISOString();

/** Local YYYY-MM-DD, which is what both helpers above expect. */
const toLocalDate = (at: Date): string =>
  [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("-");

/**
 * The window for a preset. `now` is a parameter rather than a clock read so
 * this stays pure and testable.
 *
 * "all" and "custom" both resolve to an open window: custom is driven by the
 * two date inputs instead, and resolving it here would fight them.
 */
export const presetRange = (preset: PresetId, now: Date): DateRange => {
  if (preset === "all" || preset === "custom") {
    return { from: null, to: null };
  }

  if (preset === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    // Day 0 of the next month is the last day of this one, so February and
    // the 31-day months both come out right without a lookup table.
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      from: startOfLocalDayIso(toLocalDate(first)),
      to: endOfLocalDayIso(toLocalDate(last)),
    };
  }

  if (preset === "year") {
    return {
      from: startOfLocalDayIso(toLocalDate(new Date(now.getFullYear(), 0, 1))),
      to: endOfLocalDayIso(toLocalDate(new Date(now.getFullYear(), 11, 31))),
    };
  }

  // 89 days back, not 90: the window is inclusive of today, so "the last 90
  // days" is today plus the 89 before it.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
  return {
    from: startOfLocalDayIso(toLocalDate(start)),
    to: endOfLocalDayIso(toLocalDate(now)),
  };
};
