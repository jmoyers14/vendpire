import { describe, expect, it } from "bun:test";
import { monthAfter, monthRange } from "./month.ts";

describe("monthRange", () => {
  it("runs from the first instant of the month to the last", () => {
    const { from, to } = monthRange({ year: 2026, month: 10 });

    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(to).getMonth()).toBe(9);
    expect(new Date(to).getDate()).toBe(31);
    expect(Date.parse(to) + 1).toBe(
      Date.parse(monthRange({ year: 2026, month: 11 }).from),
    );
  });

  it("rolls December into the next year", () => {
    const { to } = monthRange({ year: 2026, month: 12 });

    expect(Date.parse(to) + 1).toBe(new Date(2027, 0, 1).getTime());
  });
});

describe("monthAfter", () => {
  it("steps back across a year boundary", () => {
    expect(monthAfter({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
  });
});
