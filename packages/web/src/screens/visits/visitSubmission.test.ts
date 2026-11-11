import { describe, expect, it } from "bun:test";
import { type LayoutSlot, slotProductKey } from "@vendpire/domain";
import {
  buildRestock,
  type ProductAction,
  type Restock,
  restockWithAction,
  restockWithArrivalChange,
  restockWithNewStock,
  restockWithPrice,
  restockWithSwap,
} from "./restock.ts";
import { buildVisitRows, type VisitLineDraft, type VisitRow } from "./visitRows.ts";
import {
  buildVisitSubmission,
  problemMessage,
  type SubmissionProblem,
  type VisitSubmissionDraft,
} from "./visitSubmission.ts";

// The starting machine of every example in docs/diagrams/visit-layout-changes.md:
// A1 10 Cheetos, A2 10 Fritos, both $1.00; B1 empty.
const SHELVES = [["A1", "A2"], ["B1"]];

const PLANOGRAM_SLOTS: LayoutSlot[] = [
  { slotCode: "A1", productId: "cheetos", par: 10, priceCents: 100 },
  { slotCode: "A2", productId: "fritos", par: 10, priceCents: 100 },
];

const PRODUCTS = [
  { id: "cheetos", tracksExpiration: false },
  { id: "fritos", tracksExpiration: false },
  { id: "pretzels", tracksExpiration: false },
];

/** Count rows with Left from `left`; any row not named stays uncounted. */
const countRows = (
  left: Record<string, string>,
  planogramSlots: readonly LayoutSlot[] = PLANOGRAM_SLOTS,
): VisitRow[] =>
  buildVisitRows({
    shelves: SHELVES,
    planogramSlots,
    previousVisit: null,
    products: PRODUCTS,
  }).map((row) => ({ ...row, left: left[slotProductKey(row)] ?? "" }));

const rowFor = (rows: readonly VisitRow[], slotCode: string, productId: string) => {
  const found = rows.find(
    (candidate) => candidate.slotCode === slotCode && candidate.productId === productId,
  );
  if (!found) {
    throw new Error(`no row ${slotCode}/${productId}`);
  }
  return found;
};

const line = (patch: Partial<VisitLineDraft> & Pick<VisitLineDraft, "slotCode" | "productId">): VisitLineDraft => ({
  remaining: 0,
  added: 0,
  removed: 0,
  removedReason: null,
  priceCents: 100,
  par: 10,
  bestBy: null,
  ...patch,
});

const withAdded = (restock: Restock, row: VisitRow, added: string): Restock =>
  restockWithAction(restock, row, { kind: "added", added });

const withAction = (restock: Restock, row: VisitRow, action: ProductAction): Restock =>
  restockWithAction(restock, row, action);

const submissionOf = (args: {
  rows: readonly VisitRow[];
  restock: Restock;
  planogramSlots?: readonly LayoutSlot[];
}): VisitSubmissionDraft => {
  const result = buildVisitSubmission({
    planogramSlots: PLANOGRAM_SLOTS,
    ...args,
  });
  if (!("submission" in result)) {
    throw new Error(`expected a submission, got ${JSON.stringify(result.problems)}`);
  }
  return result.submission;
};

const problemsOf = (args: {
  rows: readonly VisitRow[];
  restock: Restock;
  planogramSlots?: readonly LayoutSlot[];
}): SubmissionProblem[] => {
  const result = buildVisitSubmission({
    planogramSlots: PLANOGRAM_SLOTS,
    ...args,
  });
  if (!("problems" in result)) {
    throw new Error("expected problems, got a submission");
  }
  return result.problems;
};

const A1_CHEETOS = slotProductKey({ slotCode: "A1", productId: "cheetos" });
const A2_FRITOS = slotProductKey({ slotCode: "A2", productId: "fritos" });

describe("buildVisitSubmission: each change in verbs", () => {
  it("top up", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" });
    const restock = withAdded(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), "6");

    const submission = submissionOf({ rows, restock });

    expect(submission.lines).toEqual([
      line({ slotCode: "A1", productId: "cheetos", remaining: 4, added: 6 }),
    ]);
    expect(submission.layoutChanges).toEqual([]);
    expect(submission.slotsAfter).toEqual(PLANOGRAM_SLOTS);
  });

  it("change price", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" });
    const answered = withAdded(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), "6");
    const restock = restockWithPrice(answered, "A1", "1.25");

    const submission = submissionOf({ rows, restock });

    expect(submission.lines).toEqual([
      line({ slotCode: "A1", productId: "cheetos", remaining: 4, added: 6, priceCents: 125 }),
    ]);
    expect(submission.layoutChanges).toEqual([
      { kind: "set-price", slotCode: "A1", priceCents: 125 },
    ]);
    expect(submission.slotsAfter).toEqual([
      { slotCode: "A1", productId: "cheetos", par: 10, priceCents: 125 },
      { slotCode: "A2", productId: "fritos", par: 10, priceCents: 100 },
    ]);
  });

  it("throw out expired", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" }).map((row) =>
      row.productId === "cheetos" ? { ...row, removed: "2", removedReason: "expired" as const } : row,
    );
    const restock = withAdded(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), "8");

    const submission = submissionOf({ rows, restock });

    expect(submission.lines).toEqual([
      line({
        slotCode: "A1",
        productId: "cheetos",
        remaining: 4,
        removed: 2,
        removedReason: "expired",
        added: 8,
      }),
    ]);
    expect(submission.layoutChanges).toEqual([]);
  });

  it("put a product into an empty slot", () => {
    const rows = countRows({});
    const withPretzels = restockWithNewStock(buildRestock({ shelves: SHELVES, rows }), {
      slotCode: "B1",
      productId: "pretzels",
      tracksExpiration: false,
    });
    const loaded = restockWithArrivalChange(withPretzels, { slotCode: "B1", productId: "pretzels" }, { added: "10" });
    const restock = restockWithPrice(loaded, "B1", "1.50");

    const submission = submissionOf({ rows, restock });

    expect(submission.lines).toEqual([
      line({ slotCode: "B1", productId: "pretzels", added: 10, priceCents: 150 }),
    ]);
    expect(submission.layoutChanges).toEqual([
      { kind: "add", slotCode: "B1", productId: "pretzels" },
      { kind: "set-price", slotCode: "B1", priceCents: 150 },
    ]);
    expect(submission.slotsAfter).toContainEqual({
      slotCode: "B1",
      productId: "pretzels",
      par: 10,
      priceCents: 150,
    });
  });

  it("remove, leave slot empty", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" });
    const restock = withAction(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), {
      kind: "pulled",
      reason: "destocked",
    });

    const submission = submissionOf({ rows, restock });

    expect(submission.lines).toEqual([
      line({
        slotCode: "A1",
        productId: "cheetos",
        remaining: 4,
        removed: 4,
        removedReason: "destocked",
      }),
    ]);
    expect(submission.layoutChanges).toEqual([
      { kind: "remove", slotCode: "A1", productId: "cheetos" },
    ]);
    expect(submission.slotsAfter).toEqual([PLANOGRAM_SLOTS[1]]);
  });

  it("replace", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" });
    const pulled = withAction(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), {
      kind: "pulled",
      reason: "destocked",
    });
    const withPretzels = restockWithNewStock(pulled, {
      slotCode: "A1",
      productId: "pretzels",
      tracksExpiration: false,
    });
    const loaded = restockWithArrivalChange(withPretzels, { slotCode: "A1", productId: "pretzels" }, { added: "10" });
    const restock = restockWithPrice(loaded, "A1", "1.50");

    const submission = submissionOf({ rows, restock });

    expect(submission.lines).toEqual([
      // The outgoing product keeps the price it sold at.
      line({
        slotCode: "A1",
        productId: "cheetos",
        remaining: 4,
        removed: 4,
        removedReason: "destocked",
        priceCents: 100,
      }),
      line({ slotCode: "A1", productId: "pretzels", added: 10, priceCents: 150 }),
    ]);
    expect(submission.layoutChanges).toEqual([
      { kind: "remove", slotCode: "A1", productId: "cheetos" },
      { kind: "add", slotCode: "A1", productId: "pretzels" },
      { kind: "set-price", slotCode: "A1", priceCents: 150 },
    ]);
  });

  it("move to an empty slot", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" });
    const moved = withAction(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), {
      kind: "moved",
      toSlotCode: "B1",
      isSwap: false,
    });
    const restock = restockWithArrivalChange(moved, { slotCode: "B1", productId: "cheetos" }, { added: "10" });

    const submission = submissionOf({ rows, restock });

    expect(submission.lines).toEqual([
      line({
        slotCode: "A1",
        productId: "cheetos",
        remaining: 4,
        removed: 4,
        removedReason: "transferred",
      }),
      line({ slotCode: "B1", productId: "cheetos", added: 10 }),
    ]);
    // B1 had no price; Restock pre-filled A1's.
    expect(submission.layoutChanges).toEqual([
      { kind: "move", productId: "cheetos", fromSlotCode: "A1", toSlotCode: "B1" },
      { kind: "set-price", slotCode: "B1", priceCents: 100 },
    ]);
    expect(submission.slotsAfter).toEqual([
      PLANOGRAM_SLOTS[1],
      { slotCode: "B1", productId: "cheetos", par: 10, priceCents: 100 },
    ]);
  });

  const swapped = (fritosLeft: string) => {
    const rows = countRows({ [A1_CHEETOS]: "4", [A2_FRITOS]: fritosLeft });
    const swap = restockWithSwap(buildRestock({ shelves: SHELVES, rows }), {
      a: rowFor(rows, "A1", "cheetos"),
      b: rowFor(rows, "A2", "fritos"),
    });
    const cheetosLoaded = restockWithArrivalChange(swap, { slotCode: "A2", productId: "cheetos" }, { added: "10" });
    const restock = restockWithArrivalChange(cheetosLoaded, { slotCode: "A1", productId: "fritos" }, { added: "10" });
    return { rows, restock };
  };

  it("swap", () => {
    const submission = submissionOf(swapped("7"));

    expect(submission.lines).toEqual([
      line({ slotCode: "A1", productId: "cheetos", remaining: 4, removed: 4, removedReason: "transferred" }),
      line({ slotCode: "A2", productId: "fritos", remaining: 7, removed: 7, removedReason: "transferred" }),
      line({ slotCode: "A2", productId: "cheetos", added: 10 }),
      line({ slotCode: "A1", productId: "fritos", added: 10 }),
    ]);
    expect(submission.layoutChanges).toEqual([
      { kind: "move", productId: "cheetos", fromSlotCode: "A1", toSlotCode: "A2" },
      { kind: "move", productId: "fritos", fromSlotCode: "A2", toSlotCode: "A1" },
    ]);
    expect(submission.slotsAfter).toEqual([
      { slotCode: "A2", productId: "cheetos", par: 10, priceCents: 100 },
      { slotCode: "A1", productId: "fritos", par: 10, priceCents: 100 },
    ]);
  });

  it("swap, one sold out: the Count 0 line removes nothing and needs no reason", () => {
    const submission = submissionOf(swapped("0"));

    expect(submission.lines).toContainEqual(
      line({ slotCode: "A2", productId: "fritos", remaining: 0, removed: 0, removedReason: null }),
    );
    expect(submission.layoutChanges).toEqual([
      { kind: "move", productId: "cheetos", fromSlotCode: "A1", toSlotCode: "A2" },
      { kind: "move", productId: "fritos", fromSlotCode: "A2", toSlotCode: "A1" },
    ]);
  });

  it("add a product behind", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" });
    const answered = withAdded(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), "2");
    const withPretzels = restockWithNewStock(answered, {
      slotCode: "A1",
      productId: "pretzels",
      tracksExpiration: false,
    });
    const restock = restockWithArrivalChange(withPretzels, { slotCode: "A1", productId: "pretzels" }, { added: "4" });

    const submission = submissionOf({ rows, restock });

    expect(submission.lines).toEqual([
      line({ slotCode: "A1", productId: "cheetos", remaining: 4, added: 2 }),
      line({ slotCode: "A1", productId: "pretzels", added: 4 }),
    ]);
    expect(submission.layoutChanges).toEqual([
      { kind: "add", slotCode: "A1", productId: "pretzels" },
    ]);
    expect(submission.slotsAfter).toContainEqual({
      slotCode: "A1",
      productId: "pretzels",
      par: 10,
      priceCents: 100,
    });
  });
});

describe("buildVisitSubmission: other rules", () => {
  it("a best-by is kept on a stocked slot and dropped on an emptied one", () => {
    const rows = countRows({ [A1_CHEETOS]: "4", [A2_FRITOS]: "0" }).map((row) => ({
      ...row,
      bestBy: "2026-12-15",
    }));
    const start = buildRestock({ shelves: SHELVES, rows });
    const cheetos = withAdded(start, rowFor(rows, "A1", "cheetos"), "6");
    const restock = withAdded(cheetos, rowFor(rows, "A2", "fritos"), "0");

    const submission = submissionOf({ rows, restock });

    expect(submission.lines.map((visitLine) => visitLine.bestBy)).toEqual(["2026-12-15", null]);
  });

  it("blank Left after a Restock answer is answered-but-uncounted", () => {
    const counted = countRows({ [A1_CHEETOS]: "4" });
    const restock = withAdded(buildRestock({ shelves: SHELVES, rows: counted }), rowFor(counted, "A1", "cheetos"), "6");
    const rows = counted.map((row) => ({ ...row, left: "" }));

    expect(problemsOf({ rows, restock })).toContainEqual({
      kind: "answered-but-uncounted",
      slotCode: "A1",
      productId: "cheetos",
    });
  });

  it("Count expired pull then Moved is split-reason", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" }).map((row) =>
      row.productId === "cheetos" ? { ...row, removed: "1", removedReason: "expired" as const } : row,
    );
    const moved = withAction(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), {
      kind: "moved",
      toSlotCode: "B1",
      isSwap: false,
    });
    const restock = restockWithArrivalChange(moved, { slotCode: "B1", productId: "cheetos" }, { added: "3" });

    expect(problemsOf({ rows, restock })).toEqual([
      { kind: "split-reason", slotCode: "A1", productId: "cheetos" },
    ]);
  });

  it("Count expired pull then Pulled expired is one reason, not split", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" }).map((row) =>
      row.productId === "cheetos" ? { ...row, removed: "1", removedReason: "expired" as const } : row,
    );
    const restock = withAction(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), {
      kind: "pulled",
      reason: "expired",
    });

    const submission = submissionOf({ rows, restock });

    expect(submission.lines).toEqual([
      line({ slotCode: "A1", productId: "cheetos", remaining: 4, removed: 4, removedReason: "expired" }),
    ]);
  });

  it("Count expired pull then Pulled to the van is split-reason", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" }).map((row) =>
      row.productId === "cheetos" ? { ...row, removed: "1", removedReason: "expired" as const } : row,
    );
    const restock = withAction(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), {
      kind: "pulled",
      reason: "destocked",
    });

    expect(problemsOf({ rows, restock })).toEqual([
      { kind: "split-reason", slotCode: "A1", productId: "cheetos" },
    ]);
  });

  it("blank Added on an arrival is added-blank, not 0", () => {
    const rows = countRows({});
    const restock = restockWithNewStock(buildRestock({ shelves: SHELVES, rows }), {
      slotCode: "A1",
      productId: "pretzels",
      tracksExpiration: false,
    });

    expect(problemsOf({ rows, restock })).toEqual([
      { kind: "added-blank", slotCode: "A1", productId: "pretzels" },
    ]);
  });

  it("empty-before slot with a blank price is price-missing", () => {
    const rows = countRows({});
    const withPretzels = restockWithNewStock(buildRestock({ shelves: SHELVES, rows }), {
      slotCode: "B1",
      productId: "pretzels",
      tracksExpiration: false,
    });
    const restock = restockWithArrivalChange(withPretzels, { slotCode: "B1", productId: "pretzels" }, { added: "10" });

    expect(problemsOf({ rows, restock })).toEqual([{ kind: "price-missing", slotCode: "B1" }]);
  });

  it("move into a slot that already holds the product is a layout problem", () => {
    const planogramSlots: LayoutSlot[] = [
      ...PLANOGRAM_SLOTS,
      { slotCode: "A2", productId: "cheetos", par: 10, priceCents: 100 },
    ];
    const rows = countRows({ [A1_CHEETOS]: "4" }, planogramSlots);
    const moved = withAction(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), {
      kind: "moved",
      toSlotCode: "A2",
      isSwap: false,
    });
    const restock = restockWithArrivalChange(moved, { slotCode: "A2", productId: "cheetos" }, { added: "4" });

    expect(problemsOf({ rows, restock, planogramSlots })).toEqual([
      {
        kind: "layout",
        violation: { kind: "product-already-in-slot", slotCode: "A2", productId: "cheetos" },
      },
    ]);
  });

  it("unanswered counted rows are listed", () => {
    const rows = countRows({ [A1_CHEETOS]: "4", [A2_FRITOS]: "7" });
    const restock = buildRestock({ shelves: SHELVES, rows });

    expect(problemsOf({ rows, restock })).toEqual([
      { kind: "unanswered", slotCode: "A1", productId: "cheetos" },
      { kind: "unanswered", slotCode: "A2", productId: "fritos" },
    ]);
  });

  it("collects problems of different kinds together", () => {
    const rows = countRows({ [A1_CHEETOS]: "4.5", [A2_FRITOS]: "7" });
    const restock = buildRestock({ shelves: SHELVES, rows });

    expect(problemsOf({ rows, restock })).toEqual([
      { kind: "invalid-count", slotCode: "A1", field: "left" },
      { kind: "unanswered", slotCode: "A2", productId: "fritos" },
    ]);
  });

  it("pulled, then the same product added back to the slot, left and came back", () => {
    const rows = countRows({ [A1_CHEETOS]: "4" });
    const pulled = withAction(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), {
      kind: "pulled",
      reason: "expired",
    });
    const readded = restockWithNewStock(pulled, { slotCode: "A1", productId: "cheetos", tracksExpiration: false });
    const restock = restockWithArrivalChange(readded, { slotCode: "A1", productId: "cheetos" }, { added: "10" });

    expect(problemsOf({ rows, restock })).toEqual([
      { kind: "left-and-came-back", slotCode: "A1", productId: "cheetos", pullReason: "expired" },
    ]);
  });

  it("moved out while the same product moved in from another slot, left and came back", () => {
    const planogramSlots: LayoutSlot[] = [
      { slotCode: "A1", productId: "cheetos", par: 10, priceCents: 100 },
      { slotCode: "A2", productId: "cheetos", par: 10, priceCents: 100 },
    ];
    const rows = countRows(
      { [A1_CHEETOS]: "4", [slotProductKey({ slotCode: "A2", productId: "cheetos" })]: "3" },
      planogramSlots,
    );
    const outOfA1 = withAction(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A1", "cheetos"), {
      kind: "moved",
      toSlotCode: "B1",
      isSwap: false,
    });
    const intoA1 = withAction(outOfA1, rowFor(rows, "A2", "cheetos"), {
      kind: "moved",
      toSlotCode: "A1",
      isSwap: false,
    });
    const filledB1 = restockWithArrivalChange(intoA1, { slotCode: "B1", productId: "cheetos" }, { added: "4" });
    const restock = restockWithArrivalChange(filledB1, { slotCode: "A1", productId: "cheetos" }, { added: "3" });

    expect(problemsOf({ rows, restock, planogramSlots })).toEqual([
      { kind: "left-and-came-back", slotCode: "A1", productId: "cheetos", pullReason: null },
    ]);
  });

  it("a price change on a slot that produced no lines is price-change-uncounted", () => {
    const rows = countRows({ [A2_FRITOS]: "7" });
    const answered = withAdded(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A2", "fritos"), "0");
    const restock = restockWithPrice(answered, "A1", "1.25");

    expect(problemsOf({ rows, restock })).toEqual([
      { kind: "price-change-uncounted", slotCode: "A1", priceCentsBefore: 100 },
    ]);
  });

  it("an uncounted slot with its price unchanged is no problem", () => {
    const rows = countRows({ [A2_FRITOS]: "7" });
    const answered = withAdded(buildRestock({ shelves: SHELVES, rows }), rowFor(rows, "A2", "fritos"), "0");
    const restock = restockWithPrice(answered, "A1", "1.00");

    expect(submissionOf({ rows, restock }).layoutChanges).toEqual([]);
  });

  it("nothing counted and nothing put in is a problem, not an empty visit", () => {
    const rows = countRows({});
    const restock = buildRestock({ shelves: SHELVES, rows });

    expect(problemsOf({ rows, restock })).toEqual([{ kind: "nothing-counted" }]);
  });
});

describe("problemMessage", () => {
  const nameOf = (productId: string) => ({ cheetos: "Cheetos", fritos: "Fritos" })[productId] ?? productId;

  it("names the slot and the product", () => {
    const message = problemMessage({ kind: "split-reason", slotCode: "A1", productId: "cheetos" }, nameOf);

    expect(message).toContain("A1");
    expect(message).toContain("Cheetos");
  });

  it("tells a product pulled and added back to be Added with a Count pull", () => {
    const message = problemMessage(
      { kind: "left-and-came-back", slotCode: "B1", productId: "cheetos", pullReason: "expired" },
      nameOf,
    );

    expect(message).toBe(
      "B1: Cheetos left and came back. Record it as Added, with the expired units as a Count pull, instead.",
    );
  });

  it("names the slot and the product when a product moved out and back in", () => {
    const message = problemMessage(
      { kind: "left-and-came-back", slotCode: "B1", productId: "cheetos", pullReason: null },
      nameOf,
    );

    expect(message).toContain("B1");
    expect(message).toContain("Cheetos");
  });

  it("asks for a count or the old price back on an uncounted price change", () => {
    const message = problemMessage({ kind: "price-change-uncounted", slotCode: "B1", priceCentsBefore: 150 }, nameOf);

    expect(message).toBe("Count B1 to change its price, or put the price back to $1.50.");
  });

  it("names the slot on a layout problem", () => {
    const message = problemMessage(
      { kind: "layout", violation: { kind: "product-already-in-slot", slotCode: "A2", productId: "cheetos" } },
      nameOf,
    );

    expect(message).toContain("A2");
    expect(message).toContain("Cheetos");
  });
});
