import { describe, expect, it } from "bun:test";
import { visitLineInput } from "./visits.ts";

const line = (over: Record<string, unknown> = {}) => ({
  slotCode: "B3",
  productId: "507f1f77bcf86cd799439011",
  remaining: 5,
  added: 5,
  priceCents: 150,
  ...over,
});

describe("visitLineInput bestBy", () => {
  it("accepts a calendar date", () => {
    const parsed = visitLineInput.parse(line({ bestBy: "2026-12-15" }));
    expect(parsed.bestBy).toBe("2026-12-15");
  });

  it("defaults to null when absent", () => {
    expect(visitLineInput.parse(line()).bestBy).toBeNull();
  });

  it("accepts an explicit null — no date recorded is a real answer", () => {
    expect(visitLineInput.parse(line({ bestBy: null })).bestBy).toBeNull();
  });

  // An instant is the exact mistake the string type exists to prevent.
  it("rejects an ISO instant", () => {
    expect(() =>
      visitLineInput.parse(line({ bestBy: "2026-12-15T00:00:00Z" })),
    ).toThrow();
  });

  it("rejects a human-written date", () => {
    expect(() => visitLineInput.parse(line({ bestBy: "Dec 15" }))).toThrow();
  });

  it("rejects an impossible month", () => {
    expect(() => visitLineInput.parse(line({ bestBy: "2026-13-01" }))).toThrow();
  });

  it("rejects a non-padded date, which would break lexicographic ordering", () => {
    expect(() => visitLineInput.parse(line({ bestBy: "2026-1-5" }))).toThrow();
  });
});
