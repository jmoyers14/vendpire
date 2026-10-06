/**
 * The worked examples from `docs/diagrams/visit-calculations.md`, asserted end
 * to end. Every number here appears in that document; if one changes, the doc
 * is wrong and this test says so.
 */
import { describe, expect, it } from "bun:test";
import { buildCostBasis } from "../costs/unitCost.ts";
import type { CostBasisLine } from "../costs/unitCost.ts";
import { diffVisits, intervalsForMachine } from "../visits/sold.ts";
import type { VisitLine, VisitObservation } from "../visits/types.ts";
import { buildIntervalPnl, buildPnlTotals } from "./pnl.ts";

const line = (
  slotCode: string,
  productId: string,
  remaining: number,
  added: number,
  priceCents: number,
  par: number,
  removal?: { units: number; reason: VisitLine["removedReason"] },
): VisitLine => ({
  slotCode,
  productId,
  remaining,
  added,
  removedUnits: removal?.units ?? 0,
  removedReason: removal?.reason ?? null,
  priceCents,
  par,
});

// Oct 5 — the first servicing on record.
const v1: VisitObservation = {
  id: "v1",
  machineId: "m1",
  countedAt: "2026-10-05T17:02:00Z",
  createdAt: "2026-10-05T17:04:11Z",
  lines: [
    line("A1", "coke", 2, 8, 150, 10),
    line("A2", "chips", 1, 7, 175, 8),
    line("A3", "bar", 4, 2, 250, 6),
  ],
};

// Oct 12 — counted at 4:48pm, submitted at 10:10pm. Coke goes up to $1.75,
// two bags of chips are binned, the dud protein bar is pulled.
const v2: VisitObservation = {
  id: "v2",
  machineId: "m1",
  countedAt: "2026-10-12T16:48:00Z",
  createdAt: "2026-10-12T22:10:03Z",
  lines: [
    line("A1", "coke", 3, 7, 175, 10),
    line("A2", "chips", 5, 5, 175, 8, { units: 2, reason: "expired" }),
    line("A3", "bar", 4, 0, 250, 6, { units: 4, reason: "destocked" }),
  ],
};

// Oct 19 — chips are replaced by pretzels, the emptied A3 takes gatorade.
const v3: VisitObservation = {
  id: "v3",
  machineId: "m1",
  countedAt: "2026-10-19T16:30:00Z",
  createdAt: "2026-10-19T16:33:40Z",
  lines: [
    line("A1", "coke", 4, 6, 175, 10),
    line("A2", "chips", 3, 0, 175, 8, { units: 3, reason: "destocked" }),
    line("A2", "pretzels", 0, 8, 200, 8),
    line("A3", "gatorade", 0, 6, 225, 6),
  ],
};

// The same visit recorded carelessly: the outgoing chips are never counted out.
const v3Careless: VisitObservation = {
  ...v3,
  lines: v3.lines.filter((l) => l.productId !== "chips"),
};

const purchase = (
  productId: string,
  units: number,
  totalCostCents: number,
): CostBasisLine => ({ productId, units, totalCostCents });

const PURCHASES = [
  purchase("coke", 24, 1199), // Oct 1, Costco
  purchase("chips", 12, 899), // Oct 1, Costco
  purchase("coke", 12, 699), // Oct 8, Smart & Final
];

/** The removals made at one visit, which is where a removal belongs. */
const removalsOf = (visit: VisitObservation) =>
  intervalsForMachine([visit]).removals;

const periodTotals = (
  previous: VisitObservation,
  current: VisitObservation,
  purchases: CostBasisLine[],
) => {
  const { intervals } = diffVisits({ previous, current });
  const { rows } = buildIntervalPnl(
    intervals,
    removalsOf(current),
    buildCostBasis(purchases),
  );
  return buildPnlTotals(rows);
};

describe("scenario 1 — an ordinary week (Oct 5 to Oct 12)", () => {
  const { intervals, anomalies } = diffVisits({ previous: v1, current: v2 });
  const at = (slotCode: string, productId: string) =>
    intervals.find((i) => i.slotCode === slotCode && i.productId === productId);

  it("sells 7 coke, 3 chips, 2 bar", () => {
    expect(at("A1", "coke")?.sold).toEqual({ status: "known", units: 7 });
    expect(at("A2", "chips")?.sold).toEqual({ status: "known", units: 3 });
    expect(at("A3", "bar")?.sold).toEqual({ status: "known", units: 2 });
  });

  it("prices coke at the old 150, even though it is now 175", () => {
    expect(at("A1", "coke")?.priceCents).toBe(150);
  });

  it("raises no anomaly — the two removals are both properly recorded", () => {
    expect(anomalies).toEqual([]);
  });

  it("records the expired chips and the destocked bar against the Oct 12 visit", () => {
    expect(removalsOf(v2)).toEqual([
      {
        slotCode: "A2",
        productId: "chips",
        visitId: "v2",
        countedAt: "2026-10-12T16:48:00Z",
        units: 2,
        reason: "expired",
      },
      {
        slotCode: "A3",
        productId: "bar",
        visitId: "v2",
        countedAt: "2026-10-12T16:48:00Z",
        units: 4,
        reason: "destocked",
      },
    ]);
  });

  it("reports $20.75 of real revenue but no profit, because the bar has no receipt", () => {
    expect(periodTotals(v1, v2, PURCHASES)).toEqual({
      revenueCents: 2075,
      cogsCents: null,
      grossProfitCents: null,
      writeOffCents: 150,
      writeOffUnits: 2,
      returnedToStockUnits: 4,
      netProfitCents: null,
      unknownSoldRows: 0,
      unknownCostRows: 1,
      unknownRemovalReasonRows: 0,
    });
  });

  it("completes that same week once the late bar receipt is entered", () => {
    // Nothing recomputed, nothing migrated — one more purchase line, and a
    // week already looked at comes out whole.
    const totals = periodTotals(v1, v2, [
      ...PURCHASES,
      purchase("bar", 12, 1440),
    ]);

    expect(totals.revenueCents).toBe(2075); // unchanged
    expect(totals.cogsCents).toBe(834); // 369 + 225 + 240
    expect(totals.grossProfitCents).toBe(1241);
    expect(totals.writeOffCents).toBe(150);
    expect(totals.netProfitCents).toBe(1091);
    expect(totals.unknownCostRows).toBe(0);
  });
});

describe("scenario 2 — replacing a product (Oct 12 to Oct 19)", () => {
  const { intervals, anomalies } = diffVisits({ previous: v2, current: v3 });
  const at = (slotCode: string, productId: string) =>
    intervals.find((i) => i.slotCode === slotCode && i.productId === productId);

  it("closes the chips with a real sold figure of 5", () => {
    expect(at("A2", "chips")?.sold).toEqual({ status: "known", units: 5 });
  });

  it("opens pretzels and gatorade with no baseline", () => {
    expect(at("A2", "pretzels")?.sold).toEqual({
      status: "unknown",
      reason: "first-visit",
    });
    expect(at("A3", "gatorade")?.sold).toEqual({
      status: "unknown",
      reason: "first-visit",
    });
  });

  it("says nothing at all about the bar, whose position already closed", () => {
    expect(at("A3", "bar")).toBeUndefined();
    expect(anomalies.map((a) => a.kind)).not.toContain("slot-not-counted");
    expect(anomalies.map((a) => a.kind)).not.toContain("product-changed");
  });

  it("costs the destock nothing, so net equals gross", () => {
    expect(periodTotals(v2, v3, PURCHASES)).toEqual({
      revenueCents: 1925,
      cogsCents: 691,
      grossProfitCents: 1234,
      writeOffCents: 0,
      writeOffUnits: 0,
      returnedToStockUnits: 3,
      netProfitCents: 1234,
      unknownSoldRows: 2,
      unknownCostRows: 0,
      unknownRemovalReasonRows: 0,
    });
  });
});

describe("scenario 2, recorded carelessly — the chips line omitted", () => {
  it("loses $8.75 of revenue and $5.00 of profit to an honest unknown", () => {
    const careful = periodTotals(v2, v3, PURCHASES);
    const careless = periodTotals(v2, v3Careless, PURCHASES);

    expect(careless.revenueCents).toBe(1050);
    expect(careless.cogsCents).toBe(316);
    expect(careless.grossProfitCents).toBe(734);
    expect(careless.unknownSoldRows).toBe(3);
    expect(careless.returnedToStockUnits).toBe(0);

    expect(careful.revenueCents - careless.revenueCents).toBe(875);
    expect(
      (careful.grossProfitCents ?? 0) - (careless.grossProfitCents ?? 0),
    ).toBe(500);
  });

  it("reports the 8 unaccounted-for chips rather than inventing their sale", () => {
    const { anomalies } = diffVisits({ previous: v2, current: v3Careless });

    expect(anomalies).toContainEqual({
      kind: "product-changed",
      slotCode: "A2",
      productId: "chips",
      unaccountedUnits: 8,
    });
  });
});

describe("the whole sequence, as a range report would fetch it", () => {
  it("adds a first-visit row per key of the earliest visit", () => {
    // findByMachineAscending includes the visit at-or-before `from` as a
    // baseline. That boundary visit has no predecessor in the fetched set, so
    // its own keys report first-visit.
    const { intervals } = intervalsForMachine([v3, v1, v2]);
    const baseline = intervals.filter((i) => i.to === v1.countedAt);

    expect(baseline).toHaveLength(3);
    expect(baseline.map((i) => i.productId)).toEqual(["coke", "chips", "bar"]);
    expect(baseline.every((i) => i.sold.status === "unknown")).toBe(true);
  });

  it("keeps first-visit rows for products introduced mid-period", () => {
    // So a period report filters on `to`, NOT on `from === to`: pretzels and
    // gatorade are also from === to, and dropping them would hide the two new
    // products the report exists to mention.
    const { intervals } = intervalsForMachine([v3, v1, v2]);
    const degenerate = intervals.filter((i) => i.from === i.to);
    const inPeriod = intervals.filter((i) => i.to !== v1.countedAt);

    expect(degenerate).toHaveLength(5); // 3 at the boundary, 2 genuinely new
    expect(
      inPeriod.filter((i) => i.from === i.to).map((i) => i.productId),
    ).toEqual(["pretzels", "gatorade"]);
  });

  it("produces ten intervals across the three visits", () => {
    // 3 baseline + 3 for Oct 12 + 4 for Oct 19. The bar contributes nothing to
    // Oct 19: its level was already zero, so the position simply closed.
    expect(intervalsForMachine([v1, v2, v3]).intervals).toHaveLength(10);
  });

  it("sorts by countedAt regardless of the order handed in", () => {
    expect(intervalsForMachine([v3, v1, v2])).toEqual(
      intervalsForMachine([v1, v2, v3]),
    );
  });

  it("collects all three visits' removals", () => {
    const { removals } = intervalsForMachine([v1, v2, v3]);

    expect(removals.map((r) => [r.productId, r.units, r.reason])).toEqual([
      ["chips", 2, "expired"],
      ["bar", 4, "destocked"],
      ["chips", 3, "destocked"],
    ]);
  });
});
