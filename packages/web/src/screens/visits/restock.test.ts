import { describe, expect, it } from "bun:test";
import { slotProductKey } from "@vendpire/domain";
import {
  arrivalsIn,
  buildRestock,
  restockWithAction,
  restockWithArrivalChange,
  restockWithNewStock,
  restockWithoutNewStock,
  restockWithPrice,
  restockWithRestUnchanged,
  restockWithSourceLinked,
  restockWithSwap,
  suggestedSourcesFor,
} from "./restock.ts";
import { buildVisitRows, type VisitRow } from "./visitRows.ts";

const SHELVES = [["A1", "A2", "A3"], ["B1"]];

const PLANOGRAM_SLOTS = [
  { slotCode: "A1", productId: "coke", par: 10, priceCents: 175 },
  { slotCode: "A2", productId: "doritos", par: 10, priceCents: 150 },
  { slotCode: "A2", productId: "lays", par: 10, priceCents: 150 },
  // A3 and B1 have no Count rows: empty-before slots.
];

const PRODUCTS = [
  { id: "coke", tracksExpiration: true },
  { id: "doritos", tracksExpiration: true },
  { id: "lays", tracksExpiration: false },
];

const countedRows = (left: Record<string, string> = {}): VisitRow[] =>
  buildVisitRows({
    shelves: SHELVES,
    planogramSlots: PLANOGRAM_SLOTS,
    previousVisit: null,
    products: PRODUCTS,
  }).map((row) => ({
    ...row,
    left: left[slotProductKey(row)] ?? "4",
    bestBy: row.productId === "coke" ? "2026-12-01" : "",
  }));

const rowFor = (rows: readonly VisitRow[], slotCode: string, productId: string) => {
  const found = rows.find(
    (candidate) =>
      candidate.slotCode === slotCode && candidate.productId === productId,
  );
  if (!found) {
    throw new Error(`no row ${slotCode}/${productId}`);
  }
  return found;
};

describe("buildRestock", () => {
  it("starts with no actions or arrivals and a price for every machine slot", () => {
    const rows = countedRows();
    const restock = buildRestock({ shelves: SHELVES, rows });

    expect(restock.actions).toEqual({});
    expect(restock.arrivals).toEqual([]);
    expect(restock.prices).toEqual({ A1: "1.75", A2: "1.5", A3: "", B1: "" });
  });
});

describe("restockWithAction", () => {
  it("moving adds an arrival at the destination carrying the source's best-by", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const start = buildRestock({ shelves: SHELVES, rows });

    const next = restockWithAction(start, coke, {
      kind: "moved",
      toSlotCode: "B1",
      isSwap: false,
    });

    expect(next.actions[slotProductKey(coke)]).toEqual({
      kind: "moved",
      toSlotCode: "B1",
      isSwap: false,
    });
    expect(next.arrivals).toEqual([
      {
        slotCode: "B1",
        productId: "coke",
        fromSlotCode: "A1",
        added: "",
        bestBy: "2026-12-01",
        tracksExpiration: true,
      },
    ]);
    expect(start.arrivals).toEqual([]);
  });

  it("moving into an empty-before slot pre-fills the source's price", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const start = buildRestock({ shelves: SHELVES, rows });

    const next = restockWithAction(start, coke, {
      kind: "moved",
      toSlotCode: "B1",
      isSwap: false,
    });

    expect(next.prices.B1).toBe("1.75");
  });

  it("moving into a priced slot leaves its price alone", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const start = buildRestock({ shelves: SHELVES, rows });

    const next = restockWithAction(start, coke, {
      kind: "moved",
      toSlotCode: "A2",
      isSwap: false,
    });

    expect(next.prices.A2).toBe("1.5");
  });

  it("changing the action removes the old arrival", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const moved = restockWithAction(buildRestock({ shelves: SHELVES, rows }), coke, {
      kind: "moved",
      toSlotCode: "B1",
      isSwap: false,
    });

    const next = restockWithAction(moved, coke, {
      kind: "pulled",
      reason: "expired",
    });

    expect(next.arrivals).toEqual([]);
    expect(next.actions[slotProductKey(coke)]).toEqual({
      kind: "pulled",
      reason: "expired",
    });
  });

  it("clearing the action removes it and its arrival", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const moved = restockWithAction(buildRestock({ shelves: SHELVES, rows }), coke, {
      kind: "moved",
      toSlotCode: "B1",
      isSwap: false,
    });

    const next = restockWithAction(moved, coke, null);

    expect(next.actions).toEqual({});
    expect(next.arrivals).toEqual([]);
  });

  it("clearing one side of a swap clears the partner's action and arrival", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const doritos = rowFor(rows, "A2", "doritos");
    const swapped = restockWithSwap(buildRestock({ shelves: SHELVES, rows }), {
      a: coke,
      b: doritos,
    });

    const next = restockWithAction(swapped, coke, null);

    expect(next.actions).toEqual({});
    expect(next.arrivals).toEqual([]);
  });
});

describe("restockWithSwap", () => {
  it("sets both rows to moved with isSwap and lands each arrival in the other's slot", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const doritos = rowFor(rows, "A2", "doritos");

    const next = restockWithSwap(buildRestock({ shelves: SHELVES, rows }), {
      a: coke,
      b: doritos,
    });

    expect(next.actions[slotProductKey(coke)]).toEqual({
      kind: "moved",
      toSlotCode: "A2",
      isSwap: true,
      withProductId: "doritos",
    });
    expect(next.actions[slotProductKey(doritos)]).toEqual({
      kind: "moved",
      toSlotCode: "A1",
      isSwap: true,
      withProductId: "coke",
    });
    expect(arrivalsIn(next, "A2").map((arrival) => arrival.productId)).toEqual([
      "coke",
    ]);
    expect(arrivalsIn(next, "A1").map((arrival) => arrival.productId)).toEqual([
      "doritos",
    ]);
  });

  it("swap with a mixed slot moves only the picked product", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const lays = rowFor(rows, "A2", "lays");
    const doritos = rowFor(rows, "A2", "doritos");

    const next = restockWithSwap(buildRestock({ shelves: SHELVES, rows }), {
      a: coke,
      b: lays,
    });

    expect(next.actions[slotProductKey(doritos)]).toBeUndefined();
    expect(next.actions[slotProductKey(lays)]).toEqual({
      kind: "moved",
      toSlotCode: "A1",
      isSwap: true,
      withProductId: "coke",
    });
    expect(next.arrivals.map((arrival) => arrival.productId).sort()).toEqual([
      "coke",
      "lays",
    ]);
  });
});

describe("restockWithNewStock", () => {
  it("adds an arrival with no source, blank Added and blank best-by", () => {
    const start = buildRestock({ shelves: SHELVES, rows: countedRows() });

    const next = restockWithNewStock(start, {
      slotCode: "A3",
      productId: "lays",
      tracksExpiration: false,
    });

    expect(next.arrivals).toEqual([
      {
        slotCode: "A3",
        productId: "lays",
        fromSlotCode: null,
        added: "",
        bestBy: "",
        tracksExpiration: false,
      },
    ]);
  });
});

describe("restockWithoutNewStock", () => {
  it("removes a new-stock arrival and keeps a moved one", () => {
    const rows = countedRows();
    const start = buildRestock({ shelves: SHELVES, rows });
    const moved = restockWithAction(start, rowFor(rows, "A1", "coke"), {
      kind: "moved",
      toSlotCode: "A3",
      isSwap: false,
    });
    const withNew = restockWithNewStock(moved, {
      slotCode: "A3",
      productId: "lays",
      tracksExpiration: false,
    });

    const withoutLays = restockWithoutNewStock(withNew, {
      slotCode: "A3",
      productId: "lays",
    });
    const withoutCoke = restockWithoutNewStock(withNew, {
      slotCode: "A3",
      productId: "coke",
    });

    expect(withoutLays.arrivals.map((arrival) => arrival.productId)).toEqual([
      "coke",
    ]);
    expect(withoutCoke.arrivals).toEqual(withNew.arrivals);
  });
});

describe("restockWithArrivalChange", () => {
  it("patches only the matching arrival", () => {
    const start = buildRestock({ shelves: SHELVES, rows: countedRows() });
    const two = restockWithNewStock(
      restockWithNewStock(start, {
        slotCode: "A3",
        productId: "lays",
        tracksExpiration: false,
      }),
      { slotCode: "B1", productId: "coke", tracksExpiration: true },
    );

    const next = restockWithArrivalChange(
      two,
      { slotCode: "B1", productId: "coke" },
      { added: "10", bestBy: "2027-01-01" },
    );

    expect(arrivalsIn(next, "B1")[0]).toMatchObject({
      added: "10",
      bestBy: "2027-01-01",
    });
    expect(arrivalsIn(next, "A3")[0]?.added).toBe("");
  });
});

describe("restockWithPrice", () => {
  it("sets one slot's price text", () => {
    const start = buildRestock({ shelves: SHELVES, rows: countedRows() });

    const next = restockWithPrice(start, "A1", "2.00");

    expect(next.prices.A1).toBe("2.00");
    expect(next.prices.A2).toBe("1.5");
    expect(start.prices.A1).toBe("1.75");
  });
});

describe("restockWithRestUnchanged", () => {
  it("gives every counted row without an action Added 0 and leaves uncounted rows", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const lays = rows.find((candidate) => candidate.productId === "lays");
    const doritos = rowFor(rows, "A2", "doritos");
    const pulled = restockWithAction(buildRestock({ shelves: SHELVES, rows }), coke, {
      kind: "pulled",
      reason: "damaged",
    });
    const uncountedRows = rows.map((candidate) =>
      candidate === lays ? { ...candidate, left: "" } : candidate,
    );

    const next = restockWithRestUnchanged(pulled, uncountedRows);

    expect(next.actions[slotProductKey(coke)]).toEqual({
      kind: "pulled",
      reason: "damaged",
    });
    expect(next.actions[slotProductKey(doritos)]).toEqual({
      kind: "added",
      added: "0",
    });
    expect(next.actions[slotProductKey(lays as VisitRow)]).toBeUndefined();
  });
});

describe("suggestedSourcesFor", () => {
  it("offers counted rows of the same product in another slot pulled as destocked", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const start = buildRestock({ shelves: SHELVES, rows });
    const pulled = restockWithAction(start, coke, {
      kind: "pulled",
      reason: "destocked",
    });
    const arrival = {
      slotCode: "B1",
      productId: "coke",
      fromSlotCode: null,
      added: "",
      bestBy: "",
      tracksExpiration: true,
    };

    expect(suggestedSourcesFor(pulled, rows, arrival)).toEqual([coke]);
  });

  it("skips other reasons, other products, the same slot and uncounted rows", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const expired = restockWithAction(
      buildRestock({ shelves: SHELVES, rows }),
      coke,
      { kind: "pulled", reason: "expired" },
    );
    const destocked = restockWithAction(
      buildRestock({ shelves: SHELVES, rows }),
      coke,
      { kind: "pulled", reason: "destocked" },
    );
    const arrival = {
      slotCode: "B1",
      productId: "coke",
      fromSlotCode: null,
      added: "",
      bestBy: "",
      tracksExpiration: true,
    };
    const uncounted = rows.map((row) => ({ ...row, left: "" }));

    expect(suggestedSourcesFor(expired, rows, arrival)).toEqual([]);
    expect(
      suggestedSourcesFor(destocked, rows, { ...arrival, productId: "lays" }),
    ).toEqual([]);
    expect(
      suggestedSourcesFor(destocked, rows, { ...arrival, slotCode: "A1" }),
    ).toEqual([]);
    expect(suggestedSourcesFor(destocked, uncounted, arrival)).toEqual([]);
  });
});

describe("restockWithSourceLinked", () => {
  it("turns the source into a move and keeps the arrival's Added", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const start = buildRestock({ shelves: SHELVES, rows });
    const pulled = restockWithAction(start, coke, {
      kind: "pulled",
      reason: "destocked",
    });
    const withStock = restockWithNewStock(pulled, {
      slotCode: "B1",
      productId: "coke",
      tracksExpiration: true,
    });
    const typed = restockWithArrivalChange(
      withStock,
      { slotCode: "B1", productId: "coke" },
      { added: "10" },
    );
    const [arrival] = arrivalsIn(typed, "B1");

    const next = restockWithSourceLinked(typed, {
      arrival: arrival as NonNullable<typeof arrival>,
      source: coke,
    });

    expect(next.actions[slotProductKey(coke)]).toEqual({
      kind: "moved",
      toSlotCode: "B1",
      isSwap: false,
    });
    expect(next.arrivals).toHaveLength(1);
    expect(next.arrivals[0]).toMatchObject({ added: "10", fromSlotCode: "A1" });
  });
});

const move = (toSlotCode: string) => ({
  kind: "moved" as const,
  toSlotCode,
  isSwap: false,
});

describe("swap partner and re-moves", () => {
  it("clearing a swap in a mixed slot clears the partner, not an earlier plain move", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const doritos = rowFor(rows, "A2", "doritos");
    const lays = rowFor(rows, "A2", "lays");
    const start = buildRestock({ shelves: SHELVES, rows });
    const plain = restockWithAction(start, doritos, move("A1"));
    const swapped = restockWithSwap(plain, { a: coke, b: lays });

    const next = restockWithAction(swapped, coke, null);

    expect(next.actions).toEqual({ [slotProductKey(doritos)]: move("A1") });
    expect(next.arrivals).toHaveLength(1);
    expect(next.arrivals[0]).toMatchObject({
      productId: "doritos",
      slotCode: "A1",
      fromSlotCode: "A2",
    });
  });

  it("changing one swap side to a plain move clears the partner", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const doritos = rowFor(rows, "A2", "doritos");
    const swapped = restockWithSwap(buildRestock({ shelves: SHELVES, rows }), {
      a: coke,
      b: doritos,
    });

    const next = restockWithAction(swapped, coke, move("B1"));

    expect(next.actions).toEqual({ [slotProductKey(coke)]: move("B1") });
    expect(next.arrivals).toHaveLength(1);
    expect(next.arrivals[0]).toMatchObject({ slotCode: "B1", productId: "coke" });
  });

  it("re-moving a row to a different slot replaces its arrival", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const first = restockWithAction(buildRestock({ shelves: SHELVES, rows }), coke, move("B1"));

    const next = restockWithAction(first, coke, move("A3"));

    expect(next.arrivals.map((arrival) => arrival.slotCode)).toEqual(["A3"]);
    expect(next.actions[slotProductKey(coke)]).toEqual(move("A3"));
  });

  it("two products moved into one slot keep both arrivals, and clearing one keeps the other", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const doritos = rowFor(rows, "A2", "doritos");
    const both = restockWithAction(
      restockWithAction(buildRestock({ shelves: SHELVES, rows }), coke, move("B1")),
      doritos,
      move("B1"),
    );

    const next = restockWithAction(both, coke, null);

    expect(arrivalsIn(both, "B1")).toHaveLength(2);
    expect(arrivalsIn(next, "B1").map((arrival) => arrival.productId)).toEqual(["doritos"]);
  });
});

describe("restockWithSourceLinked edge cases", () => {
  const cokeArrival = (restock: ReturnType<typeof buildRestock>) =>
    arrivalsIn(restock, "B1")[0] as NonNullable<ReturnType<typeof arrivalsIn>[0]>;

  it("does nothing when the source already moved there", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const moved = restockWithAction(buildRestock({ shelves: SHELVES, rows }), coke, move("B1"));
    const typed = restockWithArrivalChange(moved, { slotCode: "B1", productId: "coke" }, { added: "10" });

    const next = restockWithSourceLinked(typed, { arrival: cokeArrival(typed), source: coke });

    expect(next).toEqual(typed);
  });

  it("keeps the typed Added when the source moved there but the arrival is separate new stock", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const moved = restockWithAction(buildRestock({ shelves: SHELVES, rows }), coke, move("B1"));
    const stocked = restockWithNewStock(moved, {
      slotCode: "B1",
      productId: "coke",
      tracksExpiration: true,
    });
    const typed = restockWithArrivalChange(stocked, { slotCode: "B1", productId: "coke" }, { added: "10" });
    // The duplicate key resolves to every arrival, so pass the new-stock one.
    const newStock = { ...cokeArrival(typed), fromSlotCode: null };

    const next = restockWithSourceLinked(typed, { arrival: newStock, source: coke });

    expect(next.actions[slotProductKey(coke)]).toEqual(move("B1"));
    expect(next.arrivals).toHaveLength(1);
    expect(next.arrivals[0]).toMatchObject({ added: "10", fromSlotCode: "A1" });
  });

  it("releases the previous source when the arrival was linked to another", () => {
    const rows = countedRows();
    const coke = rowFor(rows, "A1", "coke");
    const otherCoke = { ...rowFor(rows, "A2", "doritos"), productId: "coke" };
    const first = restockWithSourceLinked(
      restockWithNewStock(buildRestock({ shelves: SHELVES, rows }), {
        slotCode: "B1",
        productId: "coke",
        tracksExpiration: true,
      }),
      {
        arrival: {
          slotCode: "B1",
          productId: "coke",
          fromSlotCode: null,
          added: "",
          bestBy: "",
          tracksExpiration: true,
        },
        source: otherCoke,
      },
    );
    const typed = restockWithArrivalChange(first, { slotCode: "B1", productId: "coke" }, { added: "7", bestBy: "2027-02-02" });

    const next = restockWithSourceLinked(typed, { arrival: cokeArrival(typed), source: coke });

    expect(next.actions[slotProductKey(otherCoke)]).toBeUndefined();
    expect(next.actions[slotProductKey(coke)]).toEqual(move("B1"));
    expect(next.arrivals).toHaveLength(1);
    expect(next.arrivals[0]).toMatchObject({ added: "7", bestBy: "2027-02-02", fromSlotCode: "A1" });
  });
});

describe("immutability", () => {
  const rows = countedRows();
  const coke = rowFor(rows, "A1", "coke");
  const doritos = rowFor(rows, "A2", "doritos");
  const base = restockWithNewStock(
    restockWithAction(buildRestock({ shelves: SHELVES, rows }), coke, move("B1")),
    { slotCode: "A3", productId: "lays", tracksExpiration: false },
  );
  const arrival = arrivalsIn(base, "A3")[0] as NonNullable<ReturnType<typeof arrivalsIn>[0]>;

  const calls: Record<string, (restock: typeof base) => unknown> = {
    restockWithAction: (r) => restockWithAction(r, coke, null),
    restockWithSwap: (r) => restockWithSwap(r, { a: coke, b: doritos }),
    restockWithNewStock: (r) =>
      restockWithNewStock(r, { slotCode: "A3", productId: "coke", tracksExpiration: true }),
    restockWithArrivalChange: (r) =>
      restockWithArrivalChange(r, { slotCode: "A3", productId: "lays" }, { added: "3" }),
    restockWithPrice: (r) => restockWithPrice(r, "A1", "9"),
    restockWithRestUnchanged: (r) => restockWithRestUnchanged(r, rows),
    restockWithSourceLinked: (r) =>
      restockWithSourceLinked(r, { arrival, source: doritos }),
  };

  for (const [name, call] of Object.entries(calls)) {
    it(`${name} does not mutate its input`, () => {
      const before = structuredClone(base);

      call(base);

      expect(base).toEqual(before);
    });
  }
});
