import { describe, expect, it } from "bun:test";
import {
  buildAddedBehindRow,
  buildVisitRows,
  isCounted,
  isSlotCounted,
  leftAfterPull,
  rowsInSlot,
  rowsWithAddedBehind,
  uncountedSlotCodes,
  type VisitRow,
  warningsFor,
} from "./visitRows.ts";

const SHELVES = [
  ["A1", "A2"],
  ["B1"],
];

const PLANOGRAM_SLOTS = [
  { slotCode: "A1", productId: "coke", par: 10, priceCents: 175 },
  { slotCode: "A2", productId: "doritos", par: 8, priceCents: 150 },
  // B1 is deliberately unassigned.
];

const PRODUCTS = [
  { id: "coke", tracksExpiration: true },
  { id: "doritos", tracksExpiration: true },
];

/** A counted row, ready to be perturbed by one test at a time. */
const row = (patch: Partial<VisitRow> = {}): VisitRow => ({
  slotCode: "A1",
  productId: "coke",
  priceCents: 175,
  par: 10,
  left: "",
  removed: "",
  removedReason: null,
  previousLevel: null,
  bestBy: "",
  previousBestBy: null,
  tracksExpiration: true,
  isAddedBehind: false,
  ...patch,
});

describe("buildVisitRows", () => {
  it("makes one row per assigned slot, in walking order", () => {
    const rows = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: null,
      products: PRODUCTS,
    });
    expect(rows.map((r) => r.slotCode)).toEqual(["A1", "A2"]);
  });

  // A line needs a product and a price; a slot the planogram never assigned
  // has neither, and inventing them would store a fiction.
  it("skips slots the planogram leaves unassigned", () => {
    const rows = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: null,
      products: PRODUCTS,
    });
    expect(rows.some((r) => r.slotCode === "B1")).toBe(false);
  });

  it("carries the planogram's par and price onto the row", () => {
    const [first] = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: null,
      products: PRODUCTS,
    });
    expect(first).toMatchObject({ par: 10, priceCents: 175 });
  });

  it("opens every row uncounted", () => {
    const rows = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: null,
      products: PRODUCTS,
    });
    expect(rows.every((r) => !isCounted(r))).toBe(true);
  });

  it("prefills previousLevel from the last visit's walk-away level", () => {
    const [first] = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: {
        // Walked away with 2 − 1 + 9 = 10.
        lines: [
          {
            slotCode: "A1",
            productId: "coke",
            remaining: 2,
            added: 9,
            removed: 1,
            removedReason: "expired",
            priceCents: 175,
            par: 10,
            bestBy: null,
          },
        ],
      },
      products: PRODUCTS,
    });
    expect(first?.previousLevel).toBe(10);
  });

  // Keyed by (slotCode, productId), like the engine: a re-planogrammed slot
  // must not inherit the outgoing product's level as its prefill.
  it("ignores a previous line for a different product in the same slot", () => {
    const [first] = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: {
        lines: [
          {
            slotCode: "A1",
            productId: "pepsi",
            remaining: 4,
            added: 0,
            removed: 0,
            removedReason: null,
            priceCents: 175,
            par: 10,
            bestBy: null,
          },
        ],
      },
      products: PRODUCTS,
    });
    expect(first?.previousLevel).toBeNull();
  });
});

describe("leftAfterPull", () => {
  it("is left − removed", () => {
    expect(leftAfterPull(row({ left: "4", removed: "1" }))).toBe(3);
  });

  it("treats a blank Removed as nothing, not as invalid", () => {
    expect(leftAfterPull(row({ left: "4" }))).toBe(4);
  });

  it("is null while the row is half-typed", () => {
    expect(leftAfterPull(row({ left: "" }))).toBeNull();
  });
});

describe("warningsFor", () => {
  it("flags removing more than was found", () => {
    expect(warningsFor(row({ left: "2", removed: "5" }), { asOf: "2026-10-17" })).toContain(
      "over-removed",
    );
  });

  it("stays quiet on an ordinary count", () => {
    expect(warningsFor(row({ left: "4" }), { asOf: "2026-10-17" })).toEqual([]);
  });
});

describe("bestBy pre-fill", () => {
  it("carries the previous visit's date for a matching slot and product", () => {
    const rows = buildVisitRows({
      shelves: [["A1"]],
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: {
        lines: [
          {
            slotCode: "A1",
            productId: "coke",
            remaining: 4,
            added: 6,
            removed: 0,
            removedReason: null,
            priceCents: 175,
            par: 10,
            bestBy: "2026-12-15",
          },
        ],
      },
      products: PRODUCTS,
    });
    expect(rows[0]?.bestBy).toBe("2026-12-15");
    expect(rows[0]?.previousBestBy).toBe("2026-12-15");
  });

  it("leaves the date blank when the slot has no history", () => {
    const rows = buildVisitRows({
      shelves: [["A1"]],
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: null,
      products: PRODUCTS,
    });
    expect(rows[0]?.bestBy).toBe("");
    expect(rows[0]?.previousBestBy).toBeNull();
  });

  it("carries the product's tracking flag onto the row", () => {
    const rows = buildVisitRows({
      shelves: [["A2"]],
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: null,
      products: [{ id: "doritos", tracksExpiration: false }],
    });
    expect(rows[0]?.tracksExpiration).toBe(false);
  });
});

describe("warningsFor expiry", () => {
  const ASOF = "2026-10-17";

  it("flags an expired slot", () => {
    expect(
      warningsFor(row({ left: "3", bestBy: "2026-10-06" }), {
        asOf: ASOF,
      }),
    ).toContain("expired");
  });

  it("flags a slot inside the window", () => {
    expect(
      warningsFor(row({ left: "3", bestBy: "2026-10-20" }), {
        asOf: ASOF,
      }),
    ).toContain("expiring-soon");
  });

  it("stays quiet beyond the window", () => {
    expect(
      warningsFor(row({ left: "3", bestBy: "2026-12-16" }), {
        asOf: ASOF,
      }),
    ).toEqual([]);
  });

  it("stays quiet on an empty slot, nothing in there to go bad", () => {
    expect(
      warningsFor(row({ left: "0", bestBy: "2026-10-06" }), {
        asOf: ASOF,
      }),
    ).toEqual([]);
  });

  it("stays quiet when the pull emptied the slot", () => {
    expect(
      warningsFor(
        row({ left: "3", removed: "3", removedReason: "expired", bestBy: "2026-10-06" }),
        { asOf: ASOF },
      ),
    ).toEqual([]);
  });

  it("stays quiet with no date recorded", () => {
    expect(
      warningsFor(row({ left: "3", bestBy: "" }), { asOf: ASOF }),
    ).toEqual([]);
  });
});

describe("mixed slots", () => {
  const MIXED_SLOTS = [
    { slotCode: "A1", productId: "ruffles", par: 10, priceCents: 150 },
    { slotCode: "A1", productId: "wavy", par: 10, priceCents: 150 },
    { slotCode: "A2", productId: "doritos", par: 8, priceCents: 150 },
  ];

  it("makes a row for every product in a slot, front to back", () => {
    const rows = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: MIXED_SLOTS,
      previousVisit: null,
      products: PRODUCTS,
    });
    expect(rows.map((r) => `${r.slotCode}:${r.productId}`)).toEqual([
      "A1:ruffles",
      "A1:wavy",
      "A2:doritos",
    ]);
  });

  it("counts a slot only once every product in it is counted", () => {
    const rows = [
      row({ productId: "ruffles", left: "1" }),
      row({ productId: "wavy" }),
      row({ slotCode: "A2", productId: "doritos", left: "2" }),
    ];
    expect(isSlotCounted(rows, "A1")).toBe(false);
    expect(isSlotCounted(rows, "A2")).toBe(true);
    expect(uncountedSlotCodes(rows)).toEqual(["A1"]);
  });
});

describe("adding a product behind", () => {
  const rows = [
    row({ productId: "ruffles", priceCents: 150, par: 10 }),
    row({ slotCode: "A2", productId: "doritos" }),
  ];
  const added = buildAddedBehindRow({
    front: rows[0] as VisitRow,
    productId: "wavy",
    tracksExpiration: false,
  });

  it("takes the slot's price and par, and starts uncounted", () => {
    expect(added).toMatchObject({
      slotCode: "A1",
      productId: "wavy",
      priceCents: 150,
      par: 10,
      left: "",
      isAddedBehind: true,
      previousLevel: null,
      tracksExpiration: false,
    });
  });

  it("lands directly behind the slot's last product", () => {
    const next = rowsWithAddedBehind(rows, added);
    expect(next.map((r) => `${r.slotCode}:${r.productId}`)).toEqual([
      "A1:ruffles",
      "A1:wavy",
      "A2:doritos",
    ]);
    expect(rowsInSlot(next, "A1")).toHaveLength(2);
  });
});
