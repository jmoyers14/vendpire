import { describe, expect, it } from "bun:test";
import { buildEditorSlots, parseDraft } from "./planogramDraft.ts";

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
