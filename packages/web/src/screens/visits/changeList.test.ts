import { describe, expect, it } from "bun:test";
import type { LayoutChange, LayoutSlot } from "@vendpire/domain";
import { describeChanges } from "./changeList.ts";
import type { VisitLineDraft } from "./visitRows.ts";
import type { VisitSubmissionDraft } from "./visitSubmission.ts";

const NAMES: Record<string, string> = {
  pistachios: "Pistachios Chili",
  nerds: "Nerds",
  amos: "Famous Amos",
  calbee: "Calbee",
  kars: "Kars",
  kitkat: "KitKat",
};
const nameOf = (productId: string) => NAMES[productId] ?? productId;

const slot = (slotCode: string, productId: string, priceCents: number): LayoutSlot => ({
  slotCode,
  productId,
  par: 10,
  priceCents,
});

const line = (
  patch: Partial<VisitLineDraft> & Pick<VisitLineDraft, "slotCode" | "productId">,
): VisitLineDraft => ({
  remaining: 0,
  added: 0,
  removed: 0,
  removedReason: null,
  priceCents: 100,
  par: 10,
  bestBy: null,
  ...patch,
});

const submissionOf = (patch: Partial<VisitSubmissionDraft>): VisitSubmissionDraft => ({
  lines: [],
  layoutChanges: [],
  slotsAfter: [],
  ...patch,
});

const describe_ = (
  submission: VisitSubmissionDraft,
  planogramSlots: LayoutSlot[] = [],
) => describeChanges({ submission, planogramSlots, nameOf });

describe("describeChanges", () => {
  it("describes a move at the same price without a price suffix", () => {
    const changes: LayoutChange[] = [
      { kind: "move", productId: "pistachios", fromSlotCode: "66", toSlotCode: "27" },
    ];
    const result = describe_(
      submissionOf({ layoutChanges: changes, slotsAfter: [slot("27", "pistachios", 225)] }),
      [slot("66", "pistachios", 225)],
    );
    expect(result).toEqual(["66 → 27 · Pistachios Chili"]);
  });

  it("adds the new and old price when a move changes the price", () => {
    const changes: LayoutChange[] = [
      { kind: "move", productId: "pistachios", fromSlotCode: "66", toSlotCode: "27" },
    ];
    const result = describe_(
      submissionOf({ layoutChanges: changes, slotsAfter: [slot("27", "pistachios", 150)] }),
      [slot("66", "pistachios", 225)],
    );
    expect(result).toEqual(["66 → 27 · Pistachios Chili · now $1.50, was $2.25"]);
  });

  it("shows a pair of opposite moves once, as a swap, at the first move's position", () => {
    const changes: LayoutChange[] = [
      { kind: "move", productId: "nerds", fromSlotCode: "13", toSlotCode: "23" },
      { kind: "move", productId: "pistachios", fromSlotCode: "66", toSlotCode: "27" },
      { kind: "move", productId: "amos", fromSlotCode: "23", toSlotCode: "13" },
    ];
    const result = describe_(
      submissionOf({
        layoutChanges: changes,
        slotsAfter: [
          slot("23", "nerds", 100),
          slot("27", "pistachios", 100),
          slot("13", "amos", 100),
        ],
      }),
      [slot("13", "nerds", 100), slot("23", "amos", 100), slot("66", "pistachios", 100)],
    );
    expect(result).toEqual(["13 ⇄ 23 · Nerds, Famous Amos", "66 → 27 · Pistachios Chili"]);
  });

  it("describes new stock with the arrival's added count", () => {
    const result = describe_(
      submissionOf({
        layoutChanges: [{ kind: "add", slotCode: "66", productId: "kitkat" }],
        lines: [line({ slotCode: "66", productId: "kitkat", added: 3 })],
      }),
    );
    expect(result).toEqual(["66 · KitKat in · 3"]);
  });

  it("describes a pull back to the van with its units", () => {
    const result = describe_(
      submissionOf({
        layoutChanges: [{ kind: "remove", slotCode: "C4", productId: "calbee" }],
        lines: [
          line({
            slotCode: "C4",
            productId: "calbee",
            remaining: 3,
            removed: 3,
            removedReason: "destocked",
          }),
        ],
      }),
    );
    expect(result).toEqual(["C4 · Calbee back to the van (3)"]);
  });

  it.each(["expired", "damaged", "recalled"] as const)("describes a %s pull as binned", (reason) => {
    const result = describe_(
      submissionOf({
        layoutChanges: [{ kind: "remove", slotCode: "D10", productId: "kars" }],
        lines: [
          line({ slotCode: "D10", productId: "kars", remaining: 1, removed: 1, removedReason: reason }),
        ],
      }),
    );
    expect(result).toEqual([`D10 · Kars binned, ${reason} (1)`]);
  });

  it("describes a sold-out pull without units", () => {
    const result = describe_(
      submissionOf({
        layoutChanges: [{ kind: "remove", slotCode: "C4", productId: "calbee" }],
        lines: [line({ slotCode: "C4", productId: "calbee" })],
      }),
    );
    expect(result).toEqual(["C4 · Calbee out (sold out)"]);
  });

  it("describes a price-only change", () => {
    const result = describe_(
      submissionOf({ layoutChanges: [{ kind: "set-price", slotCode: "A1", priceCents: 125 }] }),
      [slot("A1", "nerds", 100)],
    );
    expect(result).toEqual(["A1 · $1.00 → $1.25"]);
  });

  it("gives the new price alone when the slot had no price before", () => {
    const result = describe_(
      submissionOf({
        layoutChanges: [
          { kind: "add", slotCode: "66", productId: "kitkat" },
          { kind: "set-price", slotCode: "66", priceCents: 150 },
        ],
        lines: [line({ slotCode: "66", productId: "kitkat", added: 3 })],
      }),
    );
    expect(result).toEqual(["66 · KitKat in · 3", "66 · price $1.50"]);
  });

  it("leaves the price to the move line when a product moves into an empty slot", () => {
    const result = describe_(
      submissionOf({
        layoutChanges: [
          { kind: "move", productId: "pistachios", fromSlotCode: "66", toSlotCode: "27" },
          { kind: "set-price", slotCode: "27", priceCents: 250 },
        ],
        slotsAfter: [slot("27", "pistachios", 250)],
      }),
      [slot("66", "pistachios", 225)],
    );
    expect(result).toEqual(["66 → 27 · Pistachios Chili · now $2.50, was $2.25"]);
  });

  it("still emits a price line for a slot that also has other changes", () => {
    const result = describe_(
      submissionOf({
        layoutChanges: [
          { kind: "add", slotCode: "A1", productId: "kitkat" },
          { kind: "set-price", slotCode: "A1", priceCents: 125 },
        ],
        lines: [line({ slotCode: "A1", productId: "kitkat", added: 2 })],
      }),
      [slot("A1", "nerds", 100)],
    );
    expect(result).toEqual(["A1 · KitKat in · 2", "A1 · $1.00 → $1.25"]);
  });

  it("returns nothing when nothing changed", () => {
    expect(describe_(submissionOf({}))).toEqual([]);
  });
});
