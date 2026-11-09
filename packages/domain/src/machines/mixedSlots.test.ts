import { describe, expect, it } from "bun:test";
import { lastIndexInSlot, slotRuleViolation } from "./mixedSlots.ts";

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

describe("lastIndexInSlot", () => {
  it("finds the slot's back-most entry", () => {
    const items = [{ slotCode: "A1" }, { slotCode: "A1" }, { slotCode: "A2" }];
    expect(lastIndexInSlot(items, "A1")).toBe(1);
    expect(lastIndexInSlot(items, "B1")).toBe(-1);
  });
});
