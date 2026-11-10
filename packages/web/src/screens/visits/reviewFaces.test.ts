import { describe, expect, it } from "bun:test";
import type { LayoutSlot } from "@vendpire/domain";
import { buildAfterFace, buildBeforeFace } from "./reviewFaces.ts";
import type { VisitLineDraft } from "./visitRows.ts";
import type { VisitSubmissionDraft } from "./visitSubmission.ts";

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

const row = (slotCode: string, productId: string, left: string, isAddedBehind = false) => ({
  slotCode,
  productId,
  left,
  isAddedBehind,
  priceCents: 0,
  par: null,
});

describe("buildBeforeFace", () => {
  it("shows the planogram with Left, and no units for a blank Left", () => {
    const face = buildBeforeFace({
      planogramSlots: [slot("A1", "nerds", 200), slot("A2", "kars", 150)],
      rows: [
        row("A1", "nerds", "4"),
        row("A2", "kars", ""),
      ],
    });
    expect(face.get("A1")?.products).toEqual([
      { productId: "nerds", priceCents: 200, units: 4, wasPriceCents: null },
    ]);
    expect(face.get("A2")?.products[0]?.units).toBeNull();
    expect(face.get("A1")?.isChanged).toBe(false);
  });

  it("lists a mixed slot front first", () => {
    const face = buildBeforeFace({
      planogramSlots: [slot("A1", "nerds", 200), slot("A1", "kars", 200)],
      rows: [],
    });
    expect(face.get("A1")?.products.map((product) => product.productId)).toEqual([
      "nerds",
      "kars",
    ]);
  });
});

describe("found in a slot", () => {
  const planogramSlots = [slot("A1", "nerds", 200)];
  const rows = [row("A1", "nerds", "4"), row("A1", "amos", "2", true)];

  it("shows on the Before face behind the planogram product, at the slot price", () => {
    const face = buildBeforeFace({ planogramSlots, rows });
    expect(face.get("A1")?.products).toEqual([
      { productId: "nerds", priceCents: 200, units: 4, wasPriceCents: null },
      { productId: "amos", priceCents: 200, units: 2, wasPriceCents: null },
    ]);
  });

  it("is not a change on the After face when it stayed", () => {
    const face = buildAfterFace({
      planogramSlots,
      rows,
      submission: submissionOf({
        slotsAfter: [slot("A1", "nerds", 200), slot("A1", "amos", 200)],
        lines: [
          line({ slotCode: "A1", productId: "nerds", remaining: 4 }),
          line({ slotCode: "A1", productId: "amos", remaining: 2 }),
        ],
      }),
    });
    expect(face.get("A1")?.isChanged).toBe(false);
  });
});

describe("buildAfterFace", () => {
  const planogramSlots = [slot("A1", "nerds", 200), slot("B1", "kars", 150)];

  it("derives Now as remaining minus removed plus added", () => {
    const face = buildAfterFace({
      planogramSlots,
      rows: [],
      submission: submissionOf({
        slotsAfter: planogramSlots,
        lines: [
          line({ slotCode: "A1", productId: "nerds", remaining: 4, removed: 1, added: 6 }),
        ],
      }),
    });
    expect(face.get("A1")?.products[0]?.units).toBe(9);
    expect(face.get("A1")?.isChanged).toBe(false);
    expect(face.get("B1")?.products[0]?.units).toBeNull();
  });

  it("shows a moved product in its new slot with its Now", () => {
    const face = buildAfterFace({
      planogramSlots,
      rows: [],
      submission: submissionOf({
        slotsAfter: [slot("A1", "nerds", 200), slot("C1", "kars", 150)],
        lines: [
          line({ slotCode: "B1", productId: "kars", remaining: 3, removed: 3 }),
          line({ slotCode: "C1", productId: "kars", added: 8 }),
        ],
      }),
    });
    expect(face.get("C1")?.products[0]).toMatchObject({ productId: "kars", units: 8 });
    expect(face.get("C1")?.isChanged).toBe(true);
    expect(face.get("B1")?.products).toEqual([]);
    expect(face.get("B1")?.removedProducts).toEqual([{ productId: "kars", priceCents: 150 }]);
    expect(face.get("B1")?.isChanged).toBe(true);
  });

  it("drops a pulled product and keeps the old one for strike-through", () => {
    const face = buildAfterFace({
      planogramSlots,
      rows: [],
      submission: submissionOf({
        slotsAfter: [slot("A1", "nerds", 200)],
        lines: [line({ slotCode: "B1", productId: "kars", remaining: 2, removed: 2 })],
      }),
    });
    expect(face.get("B1")?.products).toEqual([]);
    expect(face.get("B1")?.removedProducts[0]?.productId).toBe("kars");
  });

  it("carries the old price on a repriced product", () => {
    const face = buildAfterFace({
      planogramSlots,
      rows: [],
      submission: submissionOf({
        slotsAfter: [slot("A1", "nerds", 250), slot("B1", "kars", 150)],
        lines: [line({ slotCode: "A1", productId: "nerds", remaining: 4, added: 2 })],
      }),
    });
    expect(face.get("A1")?.products[0]).toMatchObject({
      priceCents: 250,
      wasPriceCents: 200,
      units: 6,
    });
    expect(face.get("A1")?.isChanged).toBe(true);
  });

  it("lists a mixed slot front first", () => {
    const face = buildAfterFace({
      planogramSlots,
      rows: [],
      submission: submissionOf({
        slotsAfter: [slot("A1", "nerds", 200), slot("A1", "amos", 200), slot("B1", "kars", 150)],
      }),
    });
    expect(face.get("A1")?.products.map((product) => product.productId)).toEqual([
      "nerds",
      "amos",
    ]);
  });
});
