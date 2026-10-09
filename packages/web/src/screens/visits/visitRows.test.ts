import { describe, expect, it } from "bun:test";
import {
  buildVisitLines,
  buildVisitRows,
  fillToPar,
  isCounted,
  levelOf,
  rowWithAdded,
  rowWithLeft,
  rowWithRemoved,
  rowWithRemovedReason,
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

/** A counted row, ready to be perturbed by one test at a time. */
const row = (patch: Partial<VisitRow> = {}): VisitRow => ({
  slotCode: "A1",
  productId: "coke",
  priceCents: 175,
  par: 10,
  left: "",
  added: "",
  isAddedEdited: false,
  removed: "",
  removedReason: null,
  previousLevel: null,
  ...patch,
});

describe("buildVisitRows", () => {
  it("makes one row per assigned slot, in walking order", () => {
    const rows = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: null,
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
    });
    expect(rows.some((r) => r.slotCode === "B1")).toBe(false);
  });

  it("carries the planogram's par and price onto the row", () => {
    const [first] = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: null,
    });
    expect(first).toMatchObject({ par: 10, priceCents: 175 });
  });

  it("opens every row uncounted", () => {
    const rows = buildVisitRows({
      shelves: SHELVES,
      planogramSlots: PLANOGRAM_SLOTS,
      previousVisit: null,
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
          },
        ],
      },
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
          },
        ],
      },
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
    expect(warningsFor(row({ left: "4", added: "9" }))).toContain("over-par");
  });

  it("flags removing more than was found", () => {
    expect(warningsFor(row({ left: "2", removed: "5" }))).toContain(
      "over-removed",
    );
  });

  it("stays quiet on an ordinary fill to par", () => {
    expect(warningsFor(row({ left: "4", added: "6" }))).toEqual([]);
  });
});
