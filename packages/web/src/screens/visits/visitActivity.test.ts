import { describe, expect, it } from "bun:test";
import {
  buildRestock,
  type Restock,
  restockWithAction,
  restockWithArrivalChange,
  restockWithNewStock,
  restockWithRestUnchanged,
  restockWithSwap,
} from "./restock.ts";
import {
  describeSlotAnswers,
  hasActivity,
  restockTileValueFor,
  slotActivityFor,
  slotQuantityFor,
  visitActivityFor,
  visitTotalsFor,
} from "./visitActivity.ts";
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

const NAMES: Record<string, string> = { coke: "Coke", doritos: "Doritos", lays: "Lay's" };
const nameOf = (id: string) => NAMES[id] ?? id;

/** Rows filled to 10 last visit, with A1 = 4, Doritos = 7, Lay's = 0. */
const buildRows = (patch: Partial<Record<string, Partial<VisitRow>>> = {}): VisitRow[] =>
  buildVisitRows({
    shelves: SHELVES,
    planogramSlots: PLANOGRAM_SLOTS,
    previousVisit: null,
    products: PRODUCTS,
  }).map((row) => ({
    ...row,
    previousLevel: 10,
    left: { coke: "4", doritos: "7", lays: "0" }[row.productId] ?? "",
    ...patch[row.productId],
  }));

const rowOf = (rows: VisitRow[], productId: string): VisitRow => {
  const row = rows.find((candidate) => candidate.productId === productId);
  if (!row) {
    throw new Error(`no row for ${productId}`);
  }
  return row;
};

const restockFor = (rows: VisitRow[]): Restock => buildRestock({ shelves: SHELVES, rows });

describe("slotActivityFor", () => {
  it("a product that stayed: sold since last visit, added, and now", () => {
    const rows = buildRows();
    const restock = restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
      kind: "added",
      added: "6",
    });

    const [coke] = slotActivityFor({ rows, restock, slotCode: "A1" });

    expect(coke).toMatchObject({ outcome: "stayed", found: 4, sold: 6, added: 6, pulled: 0, now: 10 });
  });

  it("a partial pull lowers now and is noted", () => {
    const rows = buildRows({ coke: { removed: "2", removedReason: "expired" } });
    const restock = restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
      kind: "added",
      added: "5",
    });

    const [coke] = slotActivityFor({ rows, restock, slotCode: "A1" });

    expect(coke).toMatchObject({ pulled: 2, now: 7, notes: ["Pulled 2 · expired"] });
  });

  it("a product taken out counts everything found as pulled", () => {
    const rows = buildRows();
    const restock = restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
      kind: "pulled",
      reason: "destocked",
    });

    const [coke] = slotActivityFor({ rows, restock, slotCode: "A1" });

    expect(coke).toMatchObject({
      outcome: "taken-out",
      pulled: 4,
      now: 0,
      notes: ["Taken out · back to the van"],
    });
  });

  it("a moved product is a transfer, not a pull", () => {
    const rows = buildRows();
    const restock = restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
      kind: "moved",
      toSlotCode: "A3",
      isSwap: false,
    });

    const [coke] = slotActivityFor({ rows, restock, slotCode: "A1" });
    const [arrival] = slotActivityFor({ rows, restock, slotCode: "A3" });

    expect(coke).toMatchObject({ outcome: "moved", pulled: 0, now: 0, notes: ["Moved to A3"] });
    expect(arrival).toMatchObject({ outcome: "arrived", notes: ["From A1"], added: null });
  });

  it("an uncounted product has no numbers", () => {
    const rows = buildRows({ coke: { left: "" } });

    const [coke] = slotActivityFor({ rows, restock: restockFor(rows), slotCode: "A1" });

    expect(coke).toMatchObject({ outcome: "uncounted", found: null, sold: null, notes: ["Not counted"] });
  });

  it("no previous visit means sold is unknown", () => {
    const rows = buildRows({ coke: { previousLevel: null } });

    const [coke] = slotActivityFor({ rows, restock: restockFor(rows), slotCode: "A1" });

    expect(coke?.sold).toBeNull();
  });
});

describe("visitTotalsFor", () => {
  it("adds up sold, revenue at the slot price, added and pulled", () => {
    const rows = buildRows({ coke: { removed: "1", removedReason: "damaged" } });
    let restock = restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
      kind: "added",
      added: "6",
    });
    restock = restockWithNewStock(restock, {
      slotCode: "A3",
      productId: "lays",
      tracksExpiration: false,
    });
    restock = restockWithArrivalChange(restock, { slotCode: "A3", productId: "lays" }, { added: "8" });

    const totals = visitTotalsFor(
      visitActivityFor({ rows, restock, slotCodes: SHELVES.flat() }),
    );

    // Sold: coke 6, doritos 3, lay's 10. Revenue: 6 × 175 + 13 × 150.
    expect(totals).toEqual({
      soldCount: 19,
      revenueCents: 6 * 175 + 13 * 150,
      addedCount: 14,
      pulledCount: 1,
    });
  });

  it("sold is null when nothing has a previous visit", () => {
    const rows = buildRows().map((row) => ({ ...row, previousLevel: null }));

    const totals = visitTotalsFor(
      visitActivityFor({ rows, restock: restockFor(rows), slotCodes: SHELVES.flat() }),
    );

    expect(totals.soldCount).toBeNull();
    expect(totals.revenueCents).toBe(0);
  });
});

describe("hasActivity", () => {
  it("a product that sold nothing and got nothing is quiet", () => {
    const rows = buildRows({ coke: { left: "10" } });
    const restock = restockWithRestUnchanged(restockFor(rows), rows);

    const [coke] = slotActivityFor({ rows, restock, slotCode: "A1" });

    expect(coke && hasActivity(coke)).toBe(false);
  });

  it("an uncounted product is left out; the review warns about it separately", () => {
    const rows = buildRows({ coke: { left: "" } });

    const [coke] = slotActivityFor({ rows, restock: restockFor(rows), slotCode: "A1" });

    expect(coke && hasActivity(coke)).toBe(false);
  });

  it("anything sold, added, pulled or noted is activity", () => {
    const rows = buildRows();
    const restock = restockWithRestUnchanged(restockFor(rows), rows);

    const [coke] = slotActivityFor({ rows, restock, slotCode: "A1" });

    expect(coke && hasActivity(coke)).toBe(true);
  });
});

describe("restockTileValueFor", () => {
  const tileOf = (rows: VisitRow[], restock: Restock, slotCode: string) =>
    restockTileValueFor({ rows, restock, slotCode });

  it("is a dash until every product in the slot is answered", () => {
    const rows = buildRows();
    const restock = restockWithAction(restockFor(rows), rowOf(rows, "doritos"), {
      kind: "added",
      added: "3",
    });

    expect(tileOf(rows, restock, "A2")).toBe("—");
  });

  it("is the net change once answered", () => {
    const rows = buildRows({ coke: { removed: "3", removedReason: "expired" } });
    const plus = restockWithAction(restockFor(rows), rowOf(rows, "coke"), { kind: "added", added: "5" });
    const minus = restockWithAction(restockFor(rows), rowOf(rows, "coke"), { kind: "added", added: "1" });
    const even = restockWithAction(restockFor(rows), rowOf(rows, "coke"), { kind: "added", added: "3" });

    expect(tileOf(rows, plus, "A1")).toBe("+2");
    expect(tileOf(rows, minus, "A1")).toBe("−2");
    expect(tileOf(rows, even, "A1")).toBe("✓");
  });

  it("shows where a product moved or swapped", () => {
    const rows = buildRows();
    const moved = restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
      kind: "moved",
      toSlotCode: "A3",
      isSwap: false,
    });
    // A swap's incoming product still needs its Added before the slot is answered.
    const swapped = restockWithArrivalChange(
      restockWithSwap(restockFor(rows), { a: rowOf(rows, "coke"), b: rowOf(rows, "lays") }),
      { slotCode: "A1", productId: "lays" },
      { added: "0" },
    );

    expect(tileOf(rows, moved, "A1")).toBe("→A3");
    expect(tileOf(rows, swapped, "A1")).toBe("⇄A2");
  });

  it("says Out for a product taken out and New for new stock", () => {
    const rows = buildRows();
    const out = restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
      kind: "pulled",
      reason: "recalled",
    });
    const loaded = restockWithArrivalChange(
      restockWithNewStock(out, { slotCode: "A1", productId: "lays", tracksExpiration: false }),
      { slotCode: "A1", productId: "lays" },
      { added: "9" },
    );

    expect(tileOf(rows, out, "A1")).toBe("Out");
    expect(tileOf(rows, loaded, "A1")).toBe("New");
  });

  it("is blank for a slot with nothing in it", () => {
    const rows = buildRows();

    expect(tileOf(rows, restockFor(rows), "A3")).toBe("");
  });
});

describe("describeSlotAnswers", () => {
  it("one product: just what happened", () => {
    const rows = buildRows({ coke: { removed: "2", removedReason: "expired" } });
    const restock = restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
      kind: "added",
      added: "4",
    });

    expect(describeSlotAnswers({ rows, restock, slotCode: "A1", nameOf })).toEqual([
      "Pulled 2 · expired, Added 4",
    ]);
  });

  it("two products: each one named, unanswered ones left out", () => {
    const rows = buildRows();
    const restock = restockWithAction(restockFor(rows), rowOf(rows, "doritos"), {
      kind: "added",
      added: "0",
    });

    expect(describeSlotAnswers({ rows, restock, slotCode: "A2", nameOf })).toEqual([
      "Doritos: Nothing added",
    ]);
  });

  it("a pull logged before the product's answer still shows", () => {
    const rows = buildRows({ coke: { removed: "1", removedReason: "damaged" } });

    expect(
      describeSlotAnswers({ rows, restock: restockFor(rows), slotCode: "A1", nameOf }),
    ).toEqual(["Pulled 1 · damaged"]);
  });

  it("new stock says where it came from and how many went in", () => {
    const rows = buildRows();
    const restock = restockWithArrivalChange(
      restockWithNewStock(restockFor(rows), { slotCode: "A3", productId: "coke", tracksExpiration: false }),
      { slotCode: "A3", productId: "coke" },
      { added: "8" },
    );

    expect(describeSlotAnswers({ rows, restock, slotCode: "A3", nameOf })).toEqual([
      "New in this slot, Added 8",
    ]);
  });
});

describe("slotQuantityFor", () => {
  const quantityOf = (rows: VisitRow[], restock: Restock, slotCode: string) =>
    slotQuantityFor(slotActivityFor({ rows, restock, slotCode }));

  it("before an answer, what's in the slot after any pull", () => {
    const rows = buildRows({ coke: { removed: "1", removedReason: "expired" } });

    expect(quantityOf(rows, restockFor(rows), "A1")).toBe(3);
  });

  it("after Add stock, the level the slot is left at", () => {
    const rows = buildRows();
    const restock = restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
      kind: "added",
      added: "6",
    });

    expect(quantityOf(rows, restock, "A1")).toBe(10);
  });

  it("adds up both products in a shared slot", () => {
    const rows = buildRows();

    expect(quantityOf(rows, restockFor(rows), "A2")).toBe(7);
  });

  it("leaves out a product that moved away and counts what arrived", () => {
    const rows = buildRows();
    const restock = restockWithArrivalChange(
      restockWithAction(restockFor(rows), rowOf(rows, "coke"), {
        kind: "moved",
        toSlotCode: "A3",
        isSwap: false,
      }),
      { slotCode: "A3", productId: "coke" },
      { added: "5" },
    );

    expect(quantityOf(rows, restock, "A1")).toBeNull();
    expect(quantityOf(rows, restock, "A3")).toBe(5);
  });

  it("is null while nothing in the slot has a number", () => {
    const rows = buildRows({ coke: { left: "" } });

    expect(quantityOf(rows, restockFor(rows), "A1")).toBeNull();
  });
});
