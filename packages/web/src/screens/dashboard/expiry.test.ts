import { expect, test } from "bun:test";
import { bestByFor } from "./expiry.ts";

const now = new Date(2026, 10, 12, 9);

test("bestByFor says expired, today, tomorrow, or how many days", () => {
  expect(bestByFor({ bestBy: "2026-11-02", daysUntil: -10, now })).toEqual({
    label: "Expired Nov 2",
    isExpired: true,
  });
  expect(bestByFor({ bestBy: "2026-11-12", daysUntil: 0, now })).toEqual({
    label: "Nov 12 · today",
    isExpired: false,
  });
  expect(bestByFor({ bestBy: "2026-11-13", daysUntil: 1, now }).label).toBe("Nov 13 · tomorrow");
  expect(bestByFor({ bestBy: "2026-11-20", daysUntil: 8, now }).label).toBe("Nov 20 · in 8 days");
});
