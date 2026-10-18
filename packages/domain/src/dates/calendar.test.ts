import { describe, expect, it } from "bun:test";
import { dateAfter, daysUntil } from "./calendar.ts";

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
