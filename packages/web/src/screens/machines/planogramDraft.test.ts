import { describe, expect, it } from "bun:test";
import {
  buildEditorSlots,
  buildPlanogramSlots,
  entriesInSlot,
  parseDraft,
  problemMessageFor,
  stockLeftOut,
  withEntryAdded,
  withEntryMoved,
  withEntryPatched,
  withEntryRemoved,
  withSlotPrice,
} from "./planogramDraft.ts";

const slot = (slotCode: string, productId = "p1") => ({
  slotCode,
  productId,
  par: "10",
  price: "1.50",
});

describe("parseDraft", () => {
  it("reads back a well-formed draft", () => {
    const draft = [slot("A1")];
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it("ignores missing, malformed, and wrongly-shaped entries", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("{not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ slots: [slot("A1")] }))).toBeNull();
    expect(parseDraft(JSON.stringify([{ slotCode: "A1" }]))).toBeNull();
  });
});

describe("buildEditorSlots", () => {
  it("makes one row per current slot, in slot order", () => {
    const slots = buildEditorSlots(["A1", "A2"], [slot("A2", "p2")]);
    expect(slots).toEqual([
      { slotCode: "A1", productId: "", par: "", price: "" },
      slot("A2", "p2"),
    ]);
  });

  it("drops slots the machine no longer has", () => {
    const slots = buildEditorSlots(["A1"], [slot("A1"), slot("B9")]);
    expect(slots.map((s) => s.slotCode)).toEqual(["A1"]);
  });
});

describe("mixed slots in the editor", () => {
  const mixed = [
    slot("A1", "ruffles"),
    slot("A1", "wavy"),
    slot("A2", "doritos"),
  ];

  it("keeps every product in a slot, front to back", () => {
    const slots = buildEditorSlots(["A1", "A2"], mixed);
    expect(slots.map((s) => `${s.slotCode}:${s.productId}`)).toEqual([
      "A1:ruffles",
      "A1:wavy",
      "A2:doritos",
    ]);
  });

  it("adds an empty product behind the slot's last one, at the slot's price and par", () => {
    const next = withEntryAdded(mixed, "A1");
    expect(entriesInSlot(next, "A1")).toEqual([
      slot("A1", "ruffles"),
      slot("A1", "wavy"),
      { slotCode: "A1", productId: "", par: "10", price: "1.50" },
    ]);
    expect(next[3]).toEqual(slot("A2", "doritos"));
  });

  it("sets one price for every product in the slot", () => {
    const next = withSlotPrice(mixed, { slotCode: "A1", price: "2.00" });
    expect(entriesInSlot(next, "A1").map((e) => e.price)).toEqual(["2.00", "2.00"]);
    expect(entriesInSlot(next, "A2")[0]?.price).toBe("1.50");
  });

  it("patches one product by its position in the slot", () => {
    const next = withEntryPatched(mixed, { slotCode: "A1", index: 1 }, { productId: "lays" });
    expect(entriesInSlot(next, "A1").map((e) => e.productId)).toEqual([
      "ruffles",
      "lays",
    ]);
  });

  it("moves a product toward the front, and ignores a move past either end", () => {
    const next = withEntryMoved(mixed, { slotCode: "A1", index: 1, offset: -1 });
    expect(entriesInSlot(next, "A1").map((e) => e.productId)).toEqual([
      "wavy",
      "ruffles",
    ]);
    expect(withEntryMoved(mixed, { slotCode: "A1", index: 0, offset: -1 })).toEqual(mixed);
    expect(withEntryMoved(mixed, { slotCode: "A1", index: 1, offset: 1 })).toEqual(mixed);
  });

  it("removes a product from a mixed slot", () => {
    const next = withEntryRemoved(mixed, { slotCode: "A1", index: 0 });
    expect(entriesInSlot(next, "A1").map((e) => e.productId)).toEqual(["wavy"]);
  });

  it("leaves an empty slot, not a missing one, when its only product is removed", () => {
    const next = withEntryRemoved(mixed, { slotCode: "A2", index: 0 });
    expect(entriesInSlot(next, "A2")).toEqual([
      { slotCode: "A2", productId: "", par: "", price: "" },
    ]);
  });
});

describe("stockLeftOut", () => {
  const line = (slotCode: string, productId: string, remaining: number, added: number) => ({
    slotCode,
    productId,
    remaining,
    added,
    removed: 0,
    removedReason: null,
    priceCents: 150,
    par: 10,
    bestBy: null,
  });

  // The next visit only lists what the planogram holds, so stock left in a
  // removed product's slot goes uncounted and its sales go unknown.
  it("lists products the last visit left stock of that the draft no longer holds", () => {
    const left = stockLeftOut({
      entries: [slot("A1", "wavy")],
      previousLines: [line("A1", "ruffles", 1, 2), line("A1", "wavy", 0, 1)],
    });
    expect(left).toEqual([{ slotCode: "A1", productId: "ruffles", units: 3 }]);
  });

  it("ignores a product the last visit left empty", () => {
    expect(
      stockLeftOut({ entries: [], previousLines: [line("A1", "ruffles", 0, 0)] }),
    ).toEqual([]);
  });
});

describe("buildPlanogramSlots", () => {
  const slotCodes = ["A1", "A2"];

  it("drops unassigned slots and parses the rest", () => {
    const rows = [slot("A1"), { ...slot("A2"), productId: "" }];
    expect(buildPlanogramSlots({ rows, slotCodes })).toEqual({
      slots: [{ slotCode: "A1", productId: "p1", par: 10, priceCents: 150 }],
    });
  });

  it("refuses a par below one or a price that isn't dollars", () => {
    expect(buildPlanogramSlots({ rows: [{ ...slot("A1"), par: "0" }], slotCodes })).toEqual({
      problem: { kind: "invalid-par", slotCode: "A1" },
    });
    expect(buildPlanogramSlots({ rows: [{ ...slot("A1"), price: "abc" }], slotCodes })).toEqual({
      problem: { kind: "invalid-price", slotCode: "A1" },
    });
  });

  it("refuses a draft with nothing assigned", () => {
    const rows = [{ ...slot("A1"), productId: "" }];
    expect(buildPlanogramSlots({ rows, slotCodes })).toEqual({ problem: { kind: "no-slots" } });
  });

  it("applies the machine's slot rules", () => {
    const rows = [slot("A1"), slot("A1")];
    expect(buildPlanogramSlots({ rows, slotCodes })).toMatchObject({
      problem: { kind: "duplicate-product", slotCode: "A1" },
    });
  });
});

it("problemMessageFor names the product in a duplicate", () => {
  const message = problemMessageFor(
    { kind: "duplicate-product", slotCode: "A1", productId: "p1" },
    () => "Doritos",
  );
  expect(message).toBe("Slot A1: Doritos is listed twice");
});
