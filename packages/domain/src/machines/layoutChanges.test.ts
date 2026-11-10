import { describe, expect, test } from "bun:test";
import {
  slotsAfterChanges,
  type LayoutChange,
  type LayoutSlot,
} from "./layoutChanges.ts";

const slot = (
  slotCode: string,
  productId: string,
  priceCents = 100,
): LayoutSlot => ({ slotCode, productId, par: 10, priceCents });

const machine = (): LayoutSlot[] => [
  slot("A1", "cheetos"),
  slot("A2", "fritos"),
];

const layoutAfter = (
  slots: readonly LayoutSlot[],
  changes: readonly LayoutChange[],
): LayoutSlot[] => {
  const result = slotsAfterChanges(slots, changes);
  if ("violation" in result) {
    throw new Error(`unexpected violation ${result.violation.kind}`);
  }
  return result.slots;
};

describe("slotsAfterChanges", () => {
  test("removes a pulled product and leaves the slot empty", () => {
    const slots = layoutAfter(machine(), [
      { kind: "remove", slotCode: "A1", productId: "cheetos" },
    ]);
    expect(slots).toEqual([slot("A2", "fritos")]);
  });

  test("moves a product into an empty slot at the source's price", () => {
    const slots = layoutAfter(machine(), [
      { kind: "move", productId: "cheetos", fromSlotCode: "A1", toSlotCode: "B1" },
    ]);
    expect(slots).toContainEqual(slot("B1", "cheetos", 100));
    expect(slots.some((s) => s.slotCode === "A1")).toBe(false);
  });

  test("moves a product into an occupied slot at the destination's price, behind", () => {
    const slots = layoutAfter(
      [slot("A1", "cheetos"), slot("A2", "fritos", 150)],
      [{ kind: "move", productId: "cheetos", fromSlotCode: "A1", toSlotCode: "A2" }],
    );
    expect(slots).toEqual([slot("A2", "fritos", 150), slot("A2", "cheetos", 150)]);
  });

  test("swaps two slots and each product takes the other slot's old price", () => {
    const slots = layoutAfter(
      [slot("A1", "cheetos", 100), slot("A2", "fritos", 150)],
      [
        { kind: "move", productId: "cheetos", fromSlotCode: "A1", toSlotCode: "A2" },
        { kind: "move", productId: "fritos", fromSlotCode: "A2", toSlotCode: "A1" },
      ],
    );
    expect(slots).toContainEqual(slot("A1", "fritos", 100));
    expect(slots).toContainEqual(slot("A2", "cheetos", 150));
    expect(slots).toHaveLength(2);
  });

  test("adds a product in front of an emptied slot", () => {
    const slots = layoutAfter(machine(), [
      { kind: "remove", slotCode: "A1", productId: "cheetos" },
      { kind: "add", slotCode: "A1", productId: "pretzels" },
    ]);
    expect(slots.filter((s) => s.slotCode === "A1")).toEqual([
      slot("A1", "pretzels", 100),
    ]);
  });

  test("adds behind a staying product", () => {
    const slots = layoutAfter(machine(), [
      { kind: "add", slotCode: "A1", productId: "pretzels" },
    ]);
    expect(slots.filter((s) => s.slotCode === "A1")).toEqual([
      slot("A1", "cheetos"),
      slot("A1", "pretzels"),
    ]);
  });

  test("set-price applies to every product in the slot, including arrivals", () => {
    const slots = layoutAfter(machine(), [
      { kind: "set-price", slotCode: "A1", priceCents: 200 },
      { kind: "add", slotCode: "A1", productId: "pretzels" },
      { kind: "move", productId: "fritos", fromSlotCode: "A2", toSlotCode: "A1" },
    ]);
    expect(slots).toEqual([
      slot("A1", "cheetos", 200),
      slot("A1", "pretzels", 200),
      slot("A1", "fritos", 200),
    ]);
  });

  test("reports missing-price for an add into a slot that never had one", () => {
    expect(
      slotsAfterChanges(machine(), [
        { kind: "add", slotCode: "B1", productId: "pretzels" },
      ]),
    ).toEqual({ violation: { kind: "missing-price", slotCode: "B1" } });
  });

  test("an add into a new slot is priced by set-price", () => {
    const slots = layoutAfter(machine(), [
      { kind: "add", slotCode: "B1", productId: "pretzels" },
      { kind: "set-price", slotCode: "B1", priceCents: 150 },
    ]);
    expect(slots).toContainEqual(slot("B1", "pretzels", 150));
  });

  test("reports product-already-in-slot", () => {
    expect(
      slotsAfterChanges(
        [slot("A1", "cheetos"), slot("A2", "cheetos")],
        [{ kind: "move", productId: "cheetos", fromSlotCode: "A1", toSlotCode: "A2" }],
      ),
    ).toEqual({
      violation: { kind: "product-already-in-slot", slotCode: "A2", productId: "cheetos" },
    });
    expect(
      slotsAfterChanges(machine(), [
        { kind: "add", slotCode: "A1", productId: "cheetos" },
      ]),
    ).toEqual({
      violation: { kind: "product-already-in-slot", slotCode: "A1", productId: "cheetos" },
    });
  });

  test("reports product-not-in-slot", () => {
    const notThere = {
      violation: { kind: "product-not-in-slot", slotCode: "A1", productId: "fritos" },
    } as const;
    expect(
      slotsAfterChanges(machine(), [
        { kind: "remove", slotCode: "A1", productId: "fritos" },
      ]),
    ).toEqual(notThere);
    expect(
      slotsAfterChanges(machine(), [
        { kind: "move", productId: "fritos", fromSlotCode: "A1", toSlotCode: "B1" },
      ]),
    ).toEqual(notThere);
  });

  test("reports move-to-same-slot", () => {
    expect(
      slotsAfterChanges(machine(), [
        { kind: "move", productId: "cheetos", fromSlotCode: "A1", toSlotCode: "A1" },
      ]),
    ).toEqual({ violation: { kind: "move-to-same-slot", slotCode: "A1" } });
  });

  test("Nov 5 Prographics: three pistachios move, KitKat, Almonds and Trident take their slots", () => {
    const before = [
      slot("66", "pistachio-salted", 100),
      slot("76", "pistachio-chili", 100),
      slot("86", "pistachio-garlic", 100),
      slot("37", "trident", 125),
    ];
    const slots = layoutAfter(before, [
      { kind: "move", productId: "pistachio-salted", fromSlotCode: "66", toSlotCode: "27" },
      { kind: "move", productId: "pistachio-chili", fromSlotCode: "76", toSlotCode: "37" },
      { kind: "move", productId: "pistachio-garlic", fromSlotCode: "86", toSlotCode: "17" },
      { kind: "move", productId: "trident", fromSlotCode: "37", toSlotCode: "86" },
      { kind: "add", slotCode: "66", productId: "kitkat" },
      { kind: "add", slotCode: "76", productId: "hersheys-almonds" },
    ]);
    const layout = (code: string) =>
      slots.filter((s) => s.slotCode === code).map((s) => [s.productId, s.priceCents]);
    expect(layout("27")).toEqual([["pistachio-salted", 100]]);
    expect(layout("37")).toEqual([["pistachio-chili", 125]]);
    expect(layout("17")).toEqual([["pistachio-garlic", 100]]);
    expect(layout("66")).toEqual([["kitkat", 100]]);
    expect(layout("76")).toEqual([["hersheys-almonds", 100]]);
    expect(layout("86")).toEqual([["trident", 100]]);
    expect(slots).toHaveLength(6);
  });
});
