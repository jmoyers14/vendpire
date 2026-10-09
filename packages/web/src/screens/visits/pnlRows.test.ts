import { describe, expect, it } from "bun:test";
import type {
  PnlRows,
  SlotInterval,
  SlotRemoval,
  VisitAnomaly,
} from "@vendpire/domain";
import {
  buildUnknownNotes,
  buildVisitPnlGroups,
  describeAnomaly,
  buildProductSales,
  isActionableAnomaly,
} from "./pnlRows.ts";

const MARCH_1 = "2026-03-01T09:00:00.000Z";
const MARCH_8 = "2026-03-08T09:00:00.000Z";

const VISITS = [
  { id: "visit-2", countedAt: MARCH_8 },
  { id: "visit-1", countedAt: MARCH_1 },
];

const interval = (patch: Partial<SlotInterval> = {}): SlotInterval => ({
  slotCode: "A1",
  productId: "coke",
  from: MARCH_1,
  to: MARCH_8,
  sold: { status: "known", units: 6 },
  priceCents: 175,
  parAtFill: 10,
  ...patch,
});

const removal = (patch: Partial<SlotRemoval> = {}): SlotRemoval => ({
  slotCode: "A1",
  productId: "coke",
  visitId: "visit-2",
  countedAt: MARCH_8,
  units: 2,
  reason: "expired",
  ...patch,
});

describe("buildVisitPnlGroups", () => {
  it("files an interval under the visit that closed it", () => {
    const rows: PnlRows = {
      intervals: [{ interval: interval(), revenueCents: 1050, cogsCents: 400 }],
      removals: [],
    };
    const { groups } = buildVisitPnlGroups({ visits: VISITS, rows });
    expect(groups[0]?.visitId).toBe("visit-2");
    expect(groups[0]?.rows.intervals).toHaveLength(1);
    expect(groups[1]?.rows.intervals).toHaveLength(0);
  });

  it("files a removal by its own visitId", () => {
    const rows: PnlRows = {
      intervals: [],
      removals: [
        { removal: removal({ visitId: "visit-1" }), disposition: "written-off", costCents: 200 },
      ],
    };
    const { groups } = buildVisitPnlGroups({ visits: VISITS, rows });
    expect(groups.find((g) => g.visitId === "visit-1")?.rows.removals).toHaveLength(1);
  });

  it("keeps the visit order it was given", () => {
    const { groups } = buildVisitPnlGroups({
      visits: VISITS,
      rows: { intervals: [], removals: [] },
    });
    expect(groups.map((g) => g.visitId)).toEqual(["visit-2", "visit-1"]);
  });

  it("returns a group for a visit with nothing in the window", () => {
    const { groups } = buildVisitPnlGroups({
      visits: VISITS,
      rows: { intervals: [], removals: [] },
    });
    expect(groups).toHaveLength(2);
    expect(groups[0]?.totals.revenueCents).toBe(0);
  });

  // A missing interval reads as a missing sale, so it must be counted out loud.
  it("counts intervals whose closing visit isn't in the list", () => {
    const rows: PnlRows = {
      intervals: [
        { interval: interval({ to: "2026-01-01T09:00:00.000Z" }), revenueCents: 700, cogsCents: 300 },
      ],
      removals: [],
    };
    const { groups, ungroupedIntervalCount } = buildVisitPnlGroups({
      visits: VISITS,
      rows,
    });
    expect(ungroupedIntervalCount).toBe(1);
    expect(groups.every((g) => g.rows.intervals.length === 0)).toBe(true);
  });

  it("totals each group with the engine's own rollup", () => {
    const rows: PnlRows = {
      intervals: [
        { interval: interval(), revenueCents: 1050, cogsCents: 400 },
        { interval: interval({ slotCode: "A2" }), revenueCents: 300, cogsCents: 120 },
      ],
      removals: [],
    };
    const { groups } = buildVisitPnlGroups({ visits: VISITS, rows });
    expect(groups[0]?.totals).toMatchObject({
      revenueCents: 1350,
      cogsCents: 520,
      grossProfitCents: 830,
    });
  });

  /**
   * The rule worth proving we inherited rather than reimplemented: one unknown
   * cost poisons the group's COGS instead of being skipped, because a partial
   * sum reported as a number is confidently wrong profit.
   */
  it("reports a group's COGS as unknown when any costed row is unknown", () => {
    const rows: PnlRows = {
      intervals: [
        { interval: interval(), revenueCents: 1050, cogsCents: 400 },
        { interval: interval({ slotCode: "A2" }), revenueCents: 300, cogsCents: null },
      ],
      removals: [],
    };
    const { groups } = buildVisitPnlGroups({ visits: VISITS, rows });
    expect(groups[0]?.totals.revenueCents).toBe(1350);
    expect(groups[0]?.totals.cogsCents).toBeNull();
    expect(groups[0]?.totals.netProfitCents).toBeNull();
  });
});

describe("buildUnknownNotes", () => {
  const totals = {
    revenueCents: 1000,
    cogsCents: 400 as number | null,
    grossProfitCents: 600 as number | null,
    writeOffCents: 0 as number | null,
    writeOffUnits: 0,
    returnedToStockUnits: 0,
    netProfitCents: 600 as number | null,
    unknownSoldRows: 0,
    unknownCostRows: 0,
    unknownRemovalReasonRows: 0,
  };

  it("says nothing when every figure is known", () => {
    expect(buildUnknownNotes({ totals, anomalies: [] })).toEqual([]);
  });

  // Never a number, never a bare dash: the reader is told why.
  it("names the product count when profit is unavailable", () => {
    const notes = buildUnknownNotes({
      totals: { ...totals, cogsCents: null, netProfitCents: null, unknownCostRows: 3 },
      anomalies: [
        { kind: "unknown-cost", productId: "coke" },
        { kind: "unknown-cost", productId: "doritos" },
      ],
    });
    expect(notes[0]).toContain("Profit unavailable: 2 product(s)");
  });

  /**
   * The machine's first visit produces one unknown-sold row per line, every
   * time, so a note here could never be cleared. Each one already emits its
   * own anomaly naming the slot.
   */
  it("says nothing about unknown sold rows, which fire on every first visit", () => {
    expect(
      buildUnknownNotes({ totals: { ...totals, unknownSoldRows: 4 }, anomalies: [] }),
    ).toEqual([]);
  });

  it("explains why a write-off total is missing", () => {
    const notes = buildUnknownNotes({
      totals: { ...totals, writeOffCents: null, unknownRemovalReasonRows: 1 },
      anomalies: [],
    });
    expect(notes.join(" ")).toContain("no reason recorded");
  });

  // Nothing is missing — the units are still yours. The screen shows this as
  // plain text beside the write-off figure, not as a warning.
  it("says nothing about returned-to-stock units, which are not a problem", () => {
    expect(
      buildUnknownNotes({
        totals: { ...totals, returnedToStockUnits: 7 },
        anomalies: [],
      }),
    ).toEqual([]);
  });

  // The happy path: a correctly-entered visit with purchases logged produces
  // no notes at all, however many first-visit intervals it contains.
  it("stays silent on a clean period", () => {
    expect(
      buildUnknownNotes({
        totals: { ...totals, unknownSoldRows: 4, returnedToStockUnits: 2 },
        anomalies: [],
      }),
    ).toEqual([]);
  });
});

describe("describeAnomaly", () => {
  it("reports negative sold without implying it was clamped", () => {
    const text = describeAnomaly({
      kind: "negative-sold",
      slotCode: "A1",
      productId: "coke",
      units: -2,
    });
    expect(text).toContain("never clamped");
  });

  it("says a missing line is not zero", () => {
    const text = describeAnomaly({
      kind: "slot-not-counted",
      slotCode: "B2",
      productId: "coke",
    });
    expect(text).toContain("not zero");
  });

  it("tells you how to avoid an unaccounted product change", () => {
    const text = describeAnomaly({
      kind: "product-changed",
      slotCode: "A1",
      productId: "coke",
      unaccountedUnits: 3,
    });
    expect(text).toContain("removed = remaining");
  });

  it("describes every kind the engine can emit", () => {
    const kinds: VisitAnomaly[] = [
      { kind: "negative-sold", slotCode: "A1", productId: "p", units: -1 },
      { kind: "no-baseline", slotCode: "A1", productId: "p", reason: "first-visit" },
      { kind: "product-changed", slotCode: "A1", productId: "p", unaccountedUnits: 1 },
      { kind: "slot-not-counted", slotCode: "A1", productId: "p" },
      { kind: "over-par", slotCode: "A1", productId: "p", level: 11, par: 10 },
      { kind: "over-removed", slotCode: "A1", productId: "p", remaining: 1, removed: 3 },
      { kind: "unknown-removal-reason", slotCode: "A1", productId: "p", units: 2 },
      { kind: "unknown-cost", productId: "p" },
    ];
    for (const anomaly of kinds) {
      expect(describeAnomaly(anomaly).length).toBeGreaterThan(0);
    }
  });
});

describe("isActionableAnomaly", () => {
  // The machine's first visit emits one of these per slot, and a 40-slot
  // machine would bury every real problem under 40 copies of "this is new".
  it("drops no-baseline, which is structural rather than a problem", () => {
    expect(
      isActionableAnomaly({
        kind: "no-baseline",
        slotCode: "A1",
        productId: "coke",
        reason: "first-visit",
      }),
    ).toBe(false);
  });

  it("keeps every other kind", () => {
    const actionable: VisitAnomaly[] = [
      { kind: "negative-sold", slotCode: "A1", productId: "p", units: -1 },
      { kind: "product-changed", slotCode: "A1", productId: "p", unaccountedUnits: 1 },
      { kind: "slot-not-counted", slotCode: "A1", productId: "p" },
      { kind: "over-par", slotCode: "A1", productId: "p", level: 11, par: 10 },
      { kind: "over-removed", slotCode: "A1", productId: "p", remaining: 1, removed: 3 },
      { kind: "unknown-removal-reason", slotCode: "A1", productId: "p", units: 2 },
      { kind: "unknown-cost", productId: "p" },
    ];
    expect(actionable.every(isActionableAnomaly)).toBe(true);
  });
});

describe("buildProductSales", () => {
  const sold = (patch: Partial<SlotInterval>, revenue: number, cogs: number | null) => ({
    interval: interval(patch),
    revenueCents: revenue,
    cogsCents: cogs,
  });

  it("sums one product across every slot it occupies", () => {
    const sales = buildProductSales({
      intervals: [
        sold({ slotCode: "A1", sold: { status: "known", units: 6 } }, 1050, 400),
        sold({ slotCode: "B2", sold: { status: "known", units: 4 } }, 700, 260),
      ],
      removals: [],
    });
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({
      productId: "coke",
      soldUnits: 10,
      revenueCents: 1750,
      cogsCents: 660,
      profitCents: 1090,
    });
  });

  it("ranks by revenue, not units", () => {
    const sales = buildProductSales({
      intervals: [
        sold({ productId: "candy", sold: { status: "known", units: 50 } }, 5000, null),
        sold({ productId: "energy", sold: { status: "known", units: 20 } }, 6000, null),
      ],
      removals: [],
    });
    expect(sales.map((s) => s.productId)).toEqual(["energy", "candy"]);
  });

  /**
   * The hazard this whole module exists to avoid: a product with uncounted
   * intervals is not a product that sells badly. Those rows are excluded from
   * the sums and surfaced as a count instead of being summed as zero.
   */
  it("excludes unknown-sold intervals and counts them instead", () => {
    const sales = buildProductSales({
      intervals: [
        sold({ sold: { status: "known", units: 6 } }, 1050, 400),
        sold({ sold: { status: "unknown", reason: "slot-not-counted" } }, 0, null),
        sold({ sold: { status: "unknown", reason: "first-visit" } }, 0, null),
      ],
      removals: [],
    });
    expect(sales[0]).toMatchObject({
      soldUnits: 6,
      revenueCents: 1050,
      unknownIntervalCount: 2,
    });
  });

  // An unknown-sold row carries cogsCents: null for that reason alone. Letting
  // it through would null the product's COGS on a technicality.
  it("does not let an unknown-sold row poison the product's COGS", () => {
    const sales = buildProductSales({
      intervals: [
        sold({ sold: { status: "known", units: 6 } }, 1050, 400),
        sold({ sold: { status: "unknown", reason: "first-visit" } }, 0, null),
      ],
      removals: [],
    });
    expect(sales[0]?.cogsCents).toBe(400);
    expect(sales[0]?.profitCents).toBe(650);
  });

  it("reports unknown profit when a real sold row has no cost", () => {
    const sales = buildProductSales({
      intervals: [
        sold({ sold: { status: "known", units: 6 } }, 1050, 400),
        sold({ slotCode: "B2", sold: { status: "known", units: 4 } }, 700, null),
      ],
      removals: [],
    });
    expect(sales[0]).toMatchObject({ revenueCents: 1750, cogsCents: null, profitCents: null });
  });

  // Negative sold is real and never clamped, so it must subtract.
  it("lets negative sold pull a product's total down", () => {
    const sales = buildProductSales({
      intervals: [
        sold({ sold: { status: "known", units: 10 } }, 1750, 400),
        sold({ slotCode: "B2", sold: { status: "known", units: -2 } }, -350, -80),
      ],
      removals: [],
    });
    expect(sales[0]).toMatchObject({ soldUnits: 8, revenueCents: 1400, cogsCents: 320 });
  });

  it("is empty when there are no intervals", () => {
    expect(buildProductSales({ intervals: [], removals: [] })).toEqual([]);
  });
});
