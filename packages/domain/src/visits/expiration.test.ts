import { describe, expect, it } from "bun:test";
import type { VisitLine, VisitObservation } from "./types.ts";
import { dateAfter, daysUntil, expirationsForVisit } from "./expiration.ts";

const line = (
  slotCode: string,
  productId: string,
  remaining: number,
  added: number,
  overrides: Partial<VisitLine> = {},
): VisitLine => ({
  slotCode,
  productId,
  remaining,
  added,
  removed: 0,
  removedReason: null,
  priceCents: 150,
  par: null,
  bestBy: null,
  ...overrides,
});

const visit = (lines: VisitLine[]): VisitObservation => ({
  id: "v1",
  machineId: "m1",
  countedAt: "2026-10-17T09:00:00Z",
  createdAt: "2026-10-17T09:00:00Z",
  lines,
});

describe("dateAfter", () => {
  it("crosses a month end", () => {
    expect(dateAfter("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("crosses a year end", () => {
    expect(dateAfter("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("produces a leap day", () => {
    expect(dateAfter("2028-02-28", 1)).toBe("2028-02-29");
  });

  // Fixed to UTC, so the US spring-forward boundary is a plain 24 hours and
  // cannot shift the result by a day.
  it("crosses a DST boundary without shifting", () => {
    expect(dateAfter("2026-03-07", 1)).toBe("2026-03-08");
    expect(dateAfter("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("adds zero days", () => {
    expect(dateAfter("2026-10-17", 0)).toBe("2026-10-17");
  });
});

describe("daysUntil", () => {
  it("counts forward", () => {
    expect(daysUntil("2026-10-27", "2026-10-17")).toBe(10);
  });

  it("is zero on the day", () => {
    expect(daysUntil("2026-10-17", "2026-10-17")).toBe(0);
  });

  it("goes negative once expired", () => {
    expect(daysUntil("2026-10-15", "2026-10-17")).toBe(-2);
  });
});

describe("expirationsForVisit", () => {
  it("reports units as the level AFTER the fill, not what was found", () => {
    // Found 5, binned 2, added 5 -> 8 in the slot when you walk away.
    const result = expirationsForVisit(
      visit([
        line("B3", "doritos", 5, 5, {
          removed: 2,
          removedReason: "expired",
          bestBy: "2026-12-15",
        }),
      ]),
    );
    expect(result).toEqual([
      { slotCode: "B3", productId: "doritos", bestBy: "2026-12-15", units: 8 },
    ]);
  });

  it("excludes a slot with nothing in it", () => {
    const result = expirationsForVisit(
      visit([line("B1", "poptarts", 0, 0, { bestBy: "2026-11-30" })]),
    );
    expect(result).toEqual([]);
  });

  // The sole source for the report's `missingDates` bucket. Dropping these is
  // what would make an empty report read as "all clear".
  it("RETAINS a stocked slot with no date recorded", () => {
    const result = expirationsForVisit(visit([line("A1", "snickers", 11, 1)]));
    expect(result).toEqual([
      { slotCode: "A1", productId: "snickers", bestBy: null, units: 12 },
    ]);
  });

  it("returns one row per slot and product pair", () => {
    const result = expirationsForVisit(
      visit([
        line("B3", "doritos", 5, 5, { bestBy: "2026-12-15" }),
        line("B3", "cheetos", 2, 3, { bestBy: "2027-01-20" }),
        line("C1", "muffin", 0, 4, { bestBy: "2026-10-22" }),
      ]),
    );
    expect(result).toHaveLength(3);
    expect(result.map((row) => row.slotCode)).toEqual(["B3", "B3", "C1"]);
  });
});
