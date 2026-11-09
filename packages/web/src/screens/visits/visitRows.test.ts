import { describe, expect, it } from "bun:test";
import {
  addedBehindOf,
  buildAddedBehindRow,
  buildVisitLines,
  buildVisitRows,
  fillToPar,
  isCounted,
  isSlotCounted,
  levelOf,
  rowWithAdded,
  rowWithLeft,
  rowWithRemoved,
  rowWithRemovedReason,
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
  bestBy: null,
  left: "",
  added: "",
  isAddedEdited: false,
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

describe("fill-to-par default", () => {
  it("defaults Added to par minus what was left", () => {
    expect(rowWithLeft(row(), "4").added).toBe("6");
  });

  it("counts units being pulled out, so the slot still reaches par", () => {
    const counted = rowWithLeft(row(), "4");
    expect(rowWithRemoved(counted, "2").added).toBe("8");
  });

  it("never suggests a negative fill when the slot is over par", () => {
    expect(rowWithLeft(row(), "14").added).toBe("0");
  });

  it("suggests nothing when the slot has no par", () => {
    expect(rowWithLeft(row({ par: null }), "4").added).toBe("");
  });

  it("suggests nothing while Left is still half-typed", () => {
    expect(fillToPar(row({ left: "" }))).toBe("");
  });

  // The ergonomics win must not become a number the operator never chose.
  it("stops overwriting Added once the operator types in it", () => {
    const overridden = rowWithAdded(rowWithLeft(row(), "4"), "3");
    expect(rowWithLeft(overridden, "1").added).toBe("3");
  });
});

describe("levelOf", () => {
  it("is left − removed + added", () => {
    expect(levelOf(row({ left: "4", removed: "1", added: "7" }))).toBe(10);
  });

  it("treats blank Added and Removed as nothing, not as invalid", () => {
    expect(levelOf(row({ left: "4" }))).toBe(4);
  });

  it("is null while the row is half-typed", () => {
    expect(levelOf(row({ left: "" }))).toBeNull();
  });
});

describe("buildVisitLines", () => {
  /**
   * The most dangerous bug available here. An uncounted slot must be ABSENT
   * from the submission so the engine reports `slot-not-counted`; sending it
   * as `remaining: 0` books the whole previous fill as sold and invents
   * revenue that never happened.
   */
  it("drops an uncounted row instead of sending remaining 0", () => {
    const result = buildVisitLines([
      row({ left: "4" }),
      row({ slotCode: "A2", productId: "doritos", left: "" }),
    ]);
    expect("lines" in result && result.lines.map((l) => l.slotCode)).toEqual([
      "A1",
    ]);
  });

  it("sends blank Added and Removed as zero", () => {
    const result = buildVisitLines([row({ left: "4", added: "", removed: "" })]);
    expect("lines" in result && result.lines[0]).toMatchObject({
      remaining: 4,
      added: 0,
      removed: 0,
    });
  });

  it("carries the snapshotted price and par onto the line", () => {
    const result = buildVisitLines([row({ left: "4" })]);
    expect("lines" in result && result.lines[0]).toMatchObject({
      priceCents: 175,
      par: 10,
      bestBy: null,
    });
  });

  it("rejects a fractional count", () => {
    const result = buildVisitLines([row({ left: "1.5" })]);
    expect("error" in result && result.error).toContain("whole number");
  });

  it("rejects a negative count", () => {
    const result = buildVisitLines([row({ left: "-2" })]);
    expect("error" in result && result.error).toContain("whole number");
  });

  // Mirrors the server's refine: a reason decides loss vs. transfer, and
  // defaulting either way would overstate or hide the write-off.
  it("requires a reason once units are removed", () => {
    const result = buildVisitLines([
      row({ left: "4", removed: "2", removedReason: null }),
    ]);
    expect("error" in result && result.error).toContain("reason");
  });

  it("accepts a removal that has a reason", () => {
    const result = buildVisitLines([
      row({ left: "4", removed: "2", removedReason: "expired" }),
    ]);
    expect("lines" in result && result.lines[0]).toMatchObject({
      removed: 2,
      removedReason: "expired",
    });
  });

  // Leftover UI state, not a fact about the visit: the operator opened the
  // removal panel, picked a reason, then cleared the count.
  it("drops a reason left behind with nothing removed", () => {
    const stale = rowWithRemovedReason(row({ left: "4", removed: "0" }), "damaged");
    const result = buildVisitLines([stale]);
    expect("lines" in result && result.lines[0]?.removedReason).toBeNull();
  });

  it("refuses a submission with nothing counted at all", () => {
    const result = buildVisitLines([row(), row({ slotCode: "A2" })]);
    expect("error" in result && result.error).toContain("at least one slot");
  });
});

describe("warningsFor", () => {
  it("flags a fill past par", () => {
    expect(warningsFor(row({ left: "4", added: "9" }), { asOf: "2026-10-17" })).toContain("over-par");
  });

  it("flags removing more than was found", () => {
    expect(warningsFor(row({ left: "2", removed: "5" }), { asOf: "2026-10-17" })).toContain(
      "over-removed",
    );
  });

  it("stays quiet on an ordinary fill to par", () => {
    expect(warningsFor(row({ left: "4", added: "6" }), { asOf: "2026-10-17" })).toEqual([]);
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

describe("buildVisitLines bestBy", () => {
  it("sends a typed date through", () => {
    const result = buildVisitLines([
      row({ left: "5", added: "5", bestBy: "2026-12-15" }),
    ]);
    expect("lines" in result && result.lines[0]).toMatchObject({
      bestBy: "2026-12-15",
    });
  });

  it("sends a blank date as null, never a guessed value", () => {
    const result = buildVisitLines([row({ left: "5", added: "5", bestBy: "" })]);
    expect("lines" in result && result.lines[0]).toMatchObject({
      bestBy: null,
    });
  });

  it("rejects a malformed date with a slot-prefixed message", () => {
    const result = buildVisitLines([
      row({ slotCode: "B3", left: "5", added: "5", bestBy: "Dec 15" }),
    ]);
    expect(result).toEqual({
      error: 'Slot B3: "Best by" must be a date like 2026-12-15',
    });
  });

  // A date on a slot with nothing in it describes stock that is not there.
  it("sends null when the slot ends up empty", () => {
    const result = buildVisitLines([
      row({
        left: "2",
        added: "0",
        removed: "2",
        removedReason: "expired",
        bestBy: "2026-10-06",
      }),
    ]);
    expect("lines" in result && result.lines[0]).toMatchObject({
      bestBy: null,
    });
  });
});

describe("warningsFor expiry", () => {
  const ASOF = "2026-10-17";

  it("flags an expired slot", () => {
    expect(
      warningsFor(row({ left: "3", added: "0", bestBy: "2026-10-06" }), {
        asOf: ASOF,
      }),
    ).toContain("expired");
  });

  it("flags a slot inside the window", () => {
    expect(
      warningsFor(row({ left: "3", added: "0", bestBy: "2026-10-20" }), {
        asOf: ASOF,
      }),
    ).toContain("expiring-soon");
  });

  it("stays quiet beyond the window", () => {
    expect(
      warningsFor(row({ left: "3", added: "0", bestBy: "2026-12-16" }), {
        asOf: ASOF,
      }),
    ).toEqual([]);
  });

  it("stays quiet on an empty slot, nothing in there to go bad", () => {
    expect(
      warningsFor(row({ left: "0", added: "0", bestBy: "2026-10-06" }), {
        asOf: ASOF,
      }),
    ).toEqual([]);
  });

  it("stays quiet with no date recorded", () => {
    expect(
      warningsFor(row({ left: "3", added: "0", bestBy: "" }), { asOf: ASOF }),
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

  it("sends a line per counted product, never a zero for the blank one", () => {
    const result = buildVisitLines([
      row({ productId: "ruffles", left: "1" }),
      row({ productId: "wavy" }),
    ]);
    expect("lines" in result && result.lines.map((l) => l.productId)).toEqual([
      "ruffles",
    ]);
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

  it("lists what was added, for the planogram update", () => {
    const next = rowsWithAddedBehind(rows, added);
    expect(addedBehindOf(next)).toEqual([{ slotCode: "A1", productId: "wavy" }]);
  });

  // An added product with no count would be in the next planogram with no
  // line on this visit, so next week's sales for it could never be computed.
  it("requires a count for an added product, 0 if none were there", () => {
    const result = buildVisitLines([
      row({ productId: "ruffles", left: "1" }),
      { ...added, added: "3" },
    ]);
    expect(result).toEqual({
      error: 'Slot A1: enter "Left in slot" for the product you added behind (0 if none were there)',
    });
  });

  it("sends an added product once it's counted", () => {
    const result = buildVisitLines([
      row({ productId: "ruffles", left: "1" }),
      { ...added, left: "0", added: "3", isAddedEdited: true },
    ]);
    expect("lines" in result && result.lines[1]).toMatchObject({
      slotCode: "A1",
      productId: "wavy",
      remaining: 0,
      added: 3,
      priceCents: 150,
    });
  });
});
