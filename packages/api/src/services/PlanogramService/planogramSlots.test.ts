import { describe, expect, it } from "bun:test";
import { slotRuleViolation, slotsWithAddedBehind } from "./planogramSlots.ts";

const MACHINE = new Set(["A1", "A2"]);
const slot = (over: Record<string, unknown> = {}) => ({
  slotCode: "A1",
  productId: "ruffles",
  par: 10,
  priceCents: 150,
  ...over,
});

describe("slotRuleViolation", () => {
  it("accepts a slot holding two products at one price", () => {
    expect(
      slotRuleViolation([slot(), slot({ productId: "wavy" })], MACHINE),
    ).toBeNull();
  });

  it("rejects the same product twice in one slot", () => {
    expect(slotRuleViolation([slot(), slot()], MACHINE)).toMatch(/duplicate/i);
  });

  it("accepts the same product in two different slots", () => {
    expect(slotRuleViolation([slot(), slot({ slotCode: "A2" })], MACHINE)).toBeNull();
  });

  it("rejects two prices in one slot", () => {
    expect(
      slotRuleViolation(
        [slot(), slot({ productId: "wavy", priceCents: 200 })],
        MACHINE,
      ),
    ).toMatch(/A1.*price/);
  });

  it("rejects a slot code the machine doesn't have", () => {
    expect(slotRuleViolation([slot({ slotCode: "Z9" })], MACHINE)).toMatch(/Z9/);
  });
});

describe("slotsWithAddedBehind", () => {
  it("places the addition behind the slot's last product, at the slot's price and par", () => {
    const slots = [
      slot(),
      slot({ productId: "wavy" }),
      slot({ slotCode: "A2", productId: "fritos", priceCents: 100, par: 8 }),
    ];

    const result = slotsWithAddedBehind(slots, [
      { slotCode: "A1", productId: "cheetos" },
      { slotCode: "A2", productId: "doritos" },
    ]);

    expect(result.map((s) => `${s.slotCode}:${s.productId}`)).toEqual([
      "A1:ruffles",
      "A1:wavy",
      "A1:cheetos",
      "A2:fritos",
      "A2:doritos",
    ]);
    expect(result[2]).toMatchObject({ priceCents: 150, par: 10 });
    expect(result[4]).toMatchObject({ priceCents: 100, par: 8 });
  });

  it("leaves the input untouched", () => {
    const slots = [slot()];
    slotsWithAddedBehind(slots, [{ slotCode: "A1", productId: "wavy" }]);
    expect(slots).toHaveLength(1);
  });

  it("throws for a slot with nothing to add behind", () => {
    expect(() =>
      slotsWithAddedBehind([slot()], [{ slotCode: "A2", productId: "wavy" }]),
    ).toThrow(/A2/);
  });
});
