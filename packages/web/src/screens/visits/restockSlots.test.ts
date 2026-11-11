import { describe, expect, it } from "bun:test";
import { slotProductKey } from "@vendpire/domain";
import {
  buildRestock,
  type Restock,
  restockWithAction,
  restockWithArrivalChange,
  restockWithNewStock,
  restockWithSwap,
} from "./restock.ts";
import {
  attentionSlotCodeFor,
  isSlotAnswered,
  nextRestockSlotCode,
  nowLevelAfterRestock,
  nowLevelFor,
  productIdsAfterRestock,
  restockProgressFor,
} from "./restockSlots.ts";
import { buildVisitRows, type VisitRow } from "./visitRows.ts";

const SHELVES = [["A1", "A2", "A3"]];

const PLANOGRAM_SLOTS = [
  { slotCode: "A1", productId: "coke", par: 10, priceCents: 175 },
  { slotCode: "A2", productId: "doritos", par: 10, priceCents: 150 },
  { slotCode: "A2", productId: "lays", par: 10, priceCents: 150 },
];

const PRODUCTS = [
  { id: "coke", tracksExpiration: false },
  { id: "doritos", tracksExpiration: false },
  { id: "lays", tracksExpiration: false },
];

const buildRows = (left: Record<string, string> = {}): VisitRow[] =>
  buildVisitRows({
    shelves: SHELVES,
    planogramSlots: PLANOGRAM_SLOTS,
    previousVisit: null,
    products: PRODUCTS,
  }).map((row) => ({ ...row, left: left[slotProductKey(row)] ?? "4" }));

const rowFor = (rows: readonly VisitRow[], slotCode: string, productId: string) => {
  const found = rows.find(
    (row) => row.slotCode === slotCode && row.productId === productId,
  );
  if (!found) {
    throw new Error(`no row ${slotCode}/${productId}`);
  }
  return found;
};

describe("productIdsAfterRestock", () => {
  it("keeps unanswered and added products, drops departures, appends arrivals", () => {
    const rows = buildRows();
    const start = buildRestock({ shelves: SHELVES, rows });
    const pulled = restockWithAction(start, rowFor(rows, "A2", "doritos"), {
      kind: "pulled",
      reason: "expired",
    });
    const restock = restockWithNewStock(pulled, {
      slotCode: "A2",
      productId: "coke",
      tracksExpiration: false,
    });

    expect(productIdsAfterRestock({ rows, restock, slotCode: "A2" })).toEqual([
      "lays",
      "coke",
    ]);
  });
});

describe("isSlotAnswered", () => {
  it("needs every counted row answered and every Added filled in", () => {
    const rows = buildRows();
    const start = buildRestock({ shelves: SHELVES, rows });
    const blankAdded = restockWithAction(start, rowFor(rows, "A1", "coke"), {
      kind: "added",
      added: "",
    });
    const filled = restockWithAction(start, rowFor(rows, "A1", "coke"), {
      kind: "added",
      added: "6",
    });

    expect(isSlotAnswered({ rows, restock: start, slotCode: "A1" })).toBe(false);
    expect(isSlotAnswered({ rows, restock: blankAdded, slotCode: "A1" })).toBe(
      false,
    );
    expect(isSlotAnswered({ rows, restock: filled, slotCode: "A1" })).toBe(true);
  });

  it("ignores an uncounted row, and a slot with nothing to answer is not answered", () => {
    const rows = buildRows({
      [slotProductKey({ slotCode: "A2", productId: "lays" })]: "",
    });
    const start = buildRestock({ shelves: SHELVES, rows });
    const restock = restockWithAction(start, rowFor(rows, "A2", "doritos"), {
      kind: "added",
      added: "0",
    });

    expect(isSlotAnswered({ rows, restock, slotCode: "A2" })).toBe(true);
    expect(isSlotAnswered({ rows, restock, slotCode: "A3" })).toBe(false);
  });

  it("waits for an arrival's Added", () => {
    const rows = buildRows();
    const start = buildRestock({ shelves: SHELVES, rows });
    const arrived = restockWithNewStock(start, {
      slotCode: "A3",
      productId: "lays",
      tracksExpiration: false,
    });
    const filled = restockWithArrivalChange(
      arrived,
      { slotCode: "A3", productId: "lays" },
      { added: "8" },
    );

    expect(isSlotAnswered({ rows, restock: arrived, slotCode: "A3" })).toBe(false);
    expect(isSlotAnswered({ rows, restock: filled, slotCode: "A3" })).toBe(true);
  });
});

describe("restockProgressFor", () => {
  it("counts only slots with questions, ignoring actions of rows Count removed", () => {
    const rows = buildRows();
    const start = buildRestock({ shelves: SHELVES, rows });
    const answered = restockWithAction(start, rowFor(rows, "A1", "coke"), {
      kind: "added",
      added: "2",
    });
    const stale = {
      ...answered,
      actions: {
        ...answered.actions,
        [slotProductKey({ slotCode: "A3", productId: "ghost" })]: {
          kind: "added" as const,
          added: "1",
        },
      },
    };

    expect(
      restockProgressFor({ rows, restock: stale, slotCodes: SHELVES.flat() }),
    ).toEqual({ answeredCount: 1, totalCount: 2 });
  });
});

describe("nowLevelAfterRestock", () => {
  it("is Left − pulled + Added for a product that stayed", () => {
    const rows = buildRows().map((row) =>
      row.productId === "coke"
        ? { ...row, left: "5", removed: "1", removedReason: "expired" as const }
        : row,
    );
    const restock = restockWithAction(
      buildRestock({ shelves: SHELVES, rows }),
      rowFor(rows, "A1", "coke"),
      { kind: "added", added: "6" },
    );

    expect(nowLevelAfterRestock({ rows, restock, slotCode: "A1" })).toBe(10);
  });

  it("is the arrival's Added when it is the only product", () => {
    const rows = buildRows();
    const start = buildRestock({ shelves: SHELVES, rows });
    const moved = restockWithAction(start, rowFor(rows, "A1", "coke"), {
      kind: "moved",
      toSlotCode: "A3",
      isSwap: false,
    });
    const restock = restockWithArrivalChange(
      moved,
      { slotCode: "A3", productId: "coke" },
      { added: "9" },
    );

    expect(nowLevelAfterRestock({ rows, restock, slotCode: "A3" })).toBe(9);
    expect(nowLevelAfterRestock({ rows, restock, slotCode: "A1" })).toBe(0);
  });

  it("is null for a mixed slot or a blank Added", () => {
    const rows = buildRows();
    const start = buildRestock({ shelves: SHELVES, rows });
    const blank = restockWithAction(start, rowFor(rows, "A1", "coke"), {
      kind: "added",
      added: "",
    });

    expect(nowLevelAfterRestock({ rows, restock: start, slotCode: "A2" })).toBe(
      null,
    );
    expect(nowLevelAfterRestock({ rows, restock: blank, slotCode: "A1" })).toBe(
      null,
    );
  });
});

describe("attentionSlotCodeFor", () => {
  it("names the slot of a real problem and skips work not done yet", () => {
    expect(
      attentionSlotCodeFor({ kind: "unanswered", slotCode: "A1", productId: "x" }),
    ).toBe(null);
    expect(
      attentionSlotCodeFor({ kind: "added-blank", slotCode: "A1", productId: "x" }),
    ).toBe(null);
    expect(attentionSlotCodeFor({ kind: "price-missing", slotCode: "A3" })).toBe(
      "A3",
    );
    expect(
      attentionSlotCodeFor({
        kind: "layout",
        violation: { kind: "move-to-same-slot", slotCode: "B2" },
      }),
    ).toBe("B2");
  });
});

describe("nowLevelFor", () => {
  it("is Left − pulled + Added, null while either is blank or half-typed", () => {
    const [row] = buildRows();
    if (!row) {
      throw new Error("no rows");
    }
    const pulled = { ...row, left: "5", removed: "2", removedReason: "expired" as const };

    expect(nowLevelFor(pulled, "4")).toBe(7);
    expect(nowLevelFor(pulled, "")).toBe(null);
    expect(nowLevelFor({ ...pulled, left: "x" }, "4")).toBe(null);
  });
});

describe("nextRestockSlotCode", () => {
  const SLOT_CODES = ["A1", "A2", "A3", "B1"];
  const nextAfter = (
    { rows, restock }: { rows: VisitRow[]; restock: Restock },
    afterSlotCode: string | null,
    slotCodes: string[] = SLOT_CODES,
  ) => nextRestockSlotCode({ rows, restock, slotCodes, afterSlotCode });

  it("goes to the next slot with something to answer, skipping empty ones", () => {
    const rows = buildRows();
    const restock = buildRestock({ shelves: SHELVES, rows });

    expect(nextAfter({ rows, restock }, null)).toBe("A1");
    expect(nextAfter({ rows, restock }, "A1")).toBe("A2");
    expect(nextAfter({ rows, restock }, "A2")).toBe(null);
  });

  it("stops at an empty slot that something moved into", () => {
    const rows = buildRows();
    const start = buildRestock({ shelves: SHELVES, rows });
    const restock = restockWithAction(start, rowFor(rows, "A1", "coke"), {
      kind: "moved",
      toSlotCode: "A3",
      isSwap: false,
    });

    expect(nextAfter({ rows, restock }, "A2")).toBe("A3");
  });

  it("starts from the selected slot's place even when it has nothing to answer", () => {
    const rows = buildRows();
    const restock = buildRestock({ shelves: SHELVES, rows });

    expect(nextAfter({ rows, restock }, "A3", ["A3", "A1", "A2"])).toBe("A1");
  });
});
