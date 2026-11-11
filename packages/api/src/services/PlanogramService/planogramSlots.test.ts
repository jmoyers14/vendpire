import { describe, expect, it } from "bun:test";
import { layoutChangeMessage, slotRuleMessage } from "./planogramSlots.ts";

describe("slotRuleMessage", () => {
  it("names the slot whose prices disagree", () => {
    expect(slotRuleMessage({ kind: "mixed-price", slotCode: "A1" })).toMatch(
      /A1.*price/,
    );
  });
});

describe("layoutChangeMessage", () => {
  it("names the slot for every violation and mismatch kind", () => {
    const productId = "wavy";
    const slotCode = "B4";
    const cases: Parameters<typeof layoutChangeMessage>[0][] = [
      { kind: "product-not-in-slot", slotCode, productId },
      { kind: "product-already-in-slot", slotCode, productId },
      { kind: "missing-price", slotCode },
      { kind: "move-to-same-slot", slotCode },
      { kind: "missing-line", slotCode, productId },
      { kind: "not-fully-removed", slotCode, productId },
      { kind: "move-not-transferred", slotCode, productId },
      { kind: "added-on-outgoing", slotCode, productId },
    ];
    for (const change of cases) {
      expect(layoutChangeMessage(change)).toContain("B4");
    }
  });
});
