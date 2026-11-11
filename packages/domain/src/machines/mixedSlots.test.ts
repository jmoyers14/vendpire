import { describe, expect, it } from "bun:test";
import { slotRuleViolation } from "./mixedSlots.ts";

const MACHINE = new Set(["A1", "A2"]);
const slot = (over: Record<string, unknown> = {}) => ({
  slotCode: "A1",
  productId: "ruffles",
  priceCents: 150,
  ...over,
});

describe("slotRuleViolation", () => {
  it("accepts a slot holding two products at one price", () => {
    expect(
      slotRuleViolation([slot(), slot({ productId: "wavy" })], MACHINE),
    ).toBeNull();
  });

  it("accepts the same product in two different slots", () => {
    expect(
      slotRuleViolation([slot(), slot({ slotCode: "A2" })], MACHINE),
    ).toBeNull();
  });

  it("rejects the same product twice in one slot", () => {
    expect(slotRuleViolation([slot(), slot()], MACHINE)).toEqual({
      kind: "duplicate-product",
      slotCode: "A1",
      productId: "ruffles",
    });
  });

  it("rejects two prices in one slot", () => {
    expect(
      slotRuleViolation(
        [slot(), slot({ productId: "wavy", priceCents: 200 })],
        MACHINE,
      ),
    ).toEqual({ kind: "mixed-price", slotCode: "A1" });
  });

  it("rejects a slot code the machine doesn't have", () => {
    expect(slotRuleViolation([slot({ slotCode: "Z9" })], MACHINE)).toEqual({
      kind: "unknown-slot",
      slotCode: "Z9",
    });
  });
});
