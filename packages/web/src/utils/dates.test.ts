import { describe, expect, test } from "bun:test";
import { formatShortDate } from "./dates.ts";

// Built from local-time parts so the assertions hold in any time zone.
const localNoon = (year: number, monthIndex: number, day: number) =>
  new Date(year, monthIndex, day, 12).toISOString();

describe("formatShortDate", () => {
  const now = new Date(2026, 10, 11, 9);

  test("a date this year drops the year", () => {
    expect(formatShortDate(localNoon(2026, 10, 3), { now })).toBe("Nov 3");
  });

  test("a date in another year keeps it", () => {
    expect(formatShortDate(localNoon(2025, 11, 30), { now })).toBe("Dec 30, 2025");
  });
});
