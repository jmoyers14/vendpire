import { describe, expect, test } from "bun:test";
import {
  dateInputFor,
  formatShortDate,
  formatShortDateTime,
  middayInstantFor,
} from "./dates.ts";

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

describe("formatShortDateTime", () => {
  const now = new Date(2026, 10, 11, 9);

  test("adds the time without seconds", () => {
    expect(formatShortDateTime(new Date(2026, 9, 29, 20, 28, 41).toISOString(), { now })).toBe(
      "Oct 29, 8:28 PM",
    );
  });

  test("keeps the year for another year", () => {
    expect(formatShortDateTime(new Date(2025, 11, 30, 9, 5).toISOString(), { now })).toBe(
      "Dec 30, 2025, 9:05 AM",
    );
  });
});

describe("dateInputFor", () => {
  test("is the local calendar day, even late in the evening", () => {
    expect(dateInputFor(new Date(2026, 10, 11, 23, 30))).toBe("2026-11-11");
    expect(dateInputFor(new Date(2026, 0, 5, 0, 15))).toBe("2026-01-05");
  });

  test("reads a stored instant back as the day that was picked", () => {
    expect(dateInputFor(middayInstantFor("2026-11-11"))).toBe("2026-11-11");
  });
});

describe("middayInstantFor", () => {
  test("stores the picked day at local noon, as UTC", () => {
    expect(middayInstantFor("2026-11-11")).toBe(new Date(2026, 10, 11, 12).toISOString());
  });
});
