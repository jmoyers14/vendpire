import { describe, expect, it } from "bun:test";
import {
  endOfLocalDayIso,
  presetRange,
  startOfLocalDayIso,
} from "./dateRange.ts";

/**
 * Every assertion reads the result back through the LOCAL getters, so these
 * pass in any timezone. That is the whole point of the module: the API filters
 * on instants, but "purchases on the 5th" is a local-day window because
 * PurchaseFormScreen stamps every purchase at local midday.
 */
describe("startOfLocalDayIso", () => {
  it("is local midnight on the named day", () => {
    const at = new Date(startOfLocalDayIso("2026-10-05"));
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(9);
    expect(at.getDate()).toBe(5);
    expect(at.getHours()).toBe(0);
    expect(at.getMinutes()).toBe(0);
  });
});

describe("endOfLocalDayIso", () => {
  it("is the last millisecond of the named local day", () => {
    const at = new Date(endOfLocalDayIso("2026-10-05"));
    expect(at.getDate()).toBe(5);
    expect(at.getHours()).toBe(23);
    expect(at.getMinutes()).toBe(59);
    expect(at.getMilliseconds()).toBe(999);
  });

  it("is after the start of the same day", () => {
    expect(endOfLocalDayIso("2026-10-05") > startOfLocalDayIso("2026-10-05")).toBe(
      true,
    );
  });

  it("contains a purchase stamped at local midday — the property the filter relies on", () => {
    const midday = new Date("2026-10-05T12:00:00").toISOString();
    expect(midday >= startOfLocalDayIso("2026-10-05")).toBe(true);
    expect(midday <= endOfLocalDayIso("2026-10-05")).toBe(true);
  });
});

describe("presetRange", () => {
  // Local-time construction, so `now` means the same wall clock everywhere.
  const now = new Date(2026, 9, 5, 14, 30);

  it("leaves the window open for 'all'", () => {
    expect(presetRange("all", now)).toEqual({ from: null, to: null });
  });

  it("leaves the window open for 'custom' — the date inputs drive that", () => {
    expect(presetRange("custom", now)).toEqual({ from: null, to: null });
  });

  it("spans the whole calendar month for 'month'", () => {
    const { from, to } = presetRange("month", now);
    const start = new Date(from as string);
    const end = new Date(to as string);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(9);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(31);
    expect(end.getMonth()).toBe(9);
    expect(end.getHours()).toBe(23);
  });

  it("spans the whole calendar year for 'year'", () => {
    const { from, to } = presetRange("year", now);
    const start = new Date(from as string);
    const end = new Date(to as string);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
  });

  it("covers 90 calendar days including today for '90d'", () => {
    const { from, to } = presetRange("90d", now);
    const start = new Date(from as string);
    const end = new Date(to as string);
    // 2026-10-05 minus 89 days is 2026-07-08.
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(8);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(5);
    expect(end.getHours()).toBe(23);
  });

  it("crosses the year boundary for '90d' in January", () => {
    const { from } = presetRange("90d", new Date(2026, 0, 10, 9, 0));
    const start = new Date(from as string);
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(13);
  });

  it("handles a short month for 'month'", () => {
    const { to } = presetRange("month", new Date(2026, 1, 14, 9, 0));
    expect(new Date(to as string).getDate()).toBe(28);
  });
});
