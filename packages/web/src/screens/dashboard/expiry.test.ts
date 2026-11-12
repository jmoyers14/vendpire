import { expect, test } from "bun:test";
import { bestByLabelFor } from "./expiry.ts";

const now = new Date(2026, 10, 12, 9);

test("bestByLabelFor says expired, today, tomorrow, or how many days", () => {
  expect(bestByLabelFor({ bestBy: "2026-11-02", daysUntil: -10, now })).toBe("Expired Nov 2");
  expect(bestByLabelFor({ bestBy: "2026-11-12", daysUntil: 0, now })).toBe("Nov 12 · today");
  expect(bestByLabelFor({ bestBy: "2026-11-13", daysUntil: 1, now })).toBe("Nov 13 · tomorrow");
  expect(bestByLabelFor({ bestBy: "2026-11-20", daysUntil: 8, now })).toBe("Nov 20 · in 8 days");
});
