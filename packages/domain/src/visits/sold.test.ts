import { describe, expect, it } from "bun:test";
import type { VisitLine, VisitObservation } from "./types.ts";
import { diffVisits, intervalsForMachine, levelAfter } from "./sold.ts";
import type { SlotInterval } from "./sold.ts";

const line = (
  slotCode: string,
  productId: string,
  remaining: number,
  added: number,
  overrides: Partial<VisitLine> = {},
): VisitLine => ({
  slotCode,
  productId,
  remaining,
  added,
  removedUnits: 0,
  removedReason: null,
  priceCents: 150,
  par: null,
  ...overrides,
});

const visit = (
  id: string,
  countedAt: string,
  lines: VisitLine[],
  overrides: Partial<VisitObservation> = {},
): VisitObservation => ({
  id,
  machineId: "m1",
  countedAt,
  createdAt: countedAt,
  lines,
  ...overrides,
});

const at = (interval: readonly SlotInterval[], slotCode: string, productId: string) =>
  interval.find((i) => i.slotCode === slotCode && i.productId === productId);

const kinds = (anomalies: readonly { kind: string }[]) => anomalies.map((a) => a.kind);

const soldUnits = (interval: SlotInterval): number | null =>
  interval.sold.status === "known" ? interval.sold.units : null;

describe("levelAfter", () => {
  it("is remaining minus removed plus added", () => {
    expect(levelAfter(line("A1", "coke", 5, 7, { removedUnits: 2 }))).toBe(10);
  });
});

describe("diffVisits", () => {
  it("computes sold from the previous level minus what is left", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [line("A1", "coke", 2, 8)]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [line("A1", "coke", 3, 7)]);

    const { intervals } = diffVisits({ previous: v1, current: v2 });

    expect(intervals).toHaveLength(1);
    expect(intervals[0].sold).toEqual({ status: "known", units: 7 });
    expect(intervals[0].from).toBe("2026-10-05T17:00:00Z");
    expect(intervals[0].to).toBe("2026-10-12T17:00:00Z");
  });

  it("books the whole fill as sold when the slot comes back empty", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [line("A1", "coke", 0, 10)]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [line("A1", "coke", 0, 10)]);

    expect(diffVisits({ previous: v1, current: v2 }).intervals[0].sold).toEqual({
      status: "known",
      units: 10,
    });
  });

  it("prices the interval at the PREVIOUS visit's price, not the new one", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [
      line("A1", "coke", 2, 8, { priceCents: 150 }),
    ]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [
      line("A1", "coke", 3, 7, { priceCents: 175 }),
    ]);

    expect(diffVisits({ previous: v1, current: v2 }).intervals[0].priceCents).toBe(150);
  });

  it("carries the par in effect when the slot was filled", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [
      line("A1", "coke", 2, 8, { par: 10 }),
    ]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [
      line("A1", "coke", 3, 7, { par: 12 }),
    ]);

    expect(diffVisits({ previous: v1, current: v2 }).intervals[0].parAtFill).toBe(10);
  });

  it("reports negative sold as negative, without clamping", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [line("A1", "coke", 0, 10)]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [line("A1", "coke", 12, 0)]);

    const { intervals, anomalies } = diffVisits({ previous: v1, current: v2 });

    expect(intervals[0].sold).toEqual({ status: "known", units: -2 });
    expect(anomalies).toEqual([
      { kind: "negative-sold", slotCode: "A1", productId: "coke", units: -2 },
    ]);
  });

  it("treats every key of a first visit as having no baseline", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [
      line("A1", "coke", 2, 8),
      line("A2", "chips", 1, 7),
    ]);

    const { intervals, anomalies } = diffVisits({ previous: null, current: v1 });

    expect(intervals).toHaveLength(2);
    expect(intervals[0].sold).toEqual({ status: "unknown", reason: "first-visit" });
    expect(intervals[1].sold).toEqual({ status: "unknown", reason: "first-visit" });
    expect(kinds(anomalies)).toEqual(["no-baseline", "no-baseline"]);
  });

  it("gives a slot omitted from the later visit NO sold figure", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [
      line("A1", "coke", 2, 8),
      line("A2", "chips", 1, 7),
    ]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [line("A1", "coke", 3, 7)]);

    const { intervals, anomalies } = diffVisits({ previous: v1, current: v2 });

    // The invent-revenue guard: a missing line is NOT remaining = 0, which
    // would have booked the leftover 8 as sold.
    expect(at(intervals, "A2", "chips")?.sold).toEqual({
      status: "unknown",
      reason: "slot-not-counted",
    });
    expect(anomalies).toContainEqual({
      kind: "slot-not-counted",
      slotCode: "A2",
      productId: "chips",
    });
  });

  it("reports a product swap as product-changed with the units unaccounted for", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [line("A3", "coke", 2, 8)]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [line("A3", "sprite", 0, 10)]);

    const { intervals, anomalies } = diffVisits({ previous: v1, current: v2 });

    expect(at(intervals, "A3", "coke")?.sold).toEqual({
      status: "unknown",
      reason: "product-changed",
    });
    expect(at(intervals, "A3", "sprite")?.sold).toEqual({
      status: "unknown",
      reason: "first-visit",
    });
    expect(anomalies).toContainEqual({
      kind: "product-changed",
      slotCode: "A3",
      productId: "coke",
      unaccountedUnits: 10,
    });
  });

  it("gives a real sold figure when the outgoing product IS counted out", () => {
    const v1 = visit("v1", "2026-10-12T17:00:00Z", [
      line("A2", "chips", 1, 7, { priceCents: 175, par: 8 }),
    ]);
    const v2 = visit("v2", "2026-10-19T17:00:00Z", [
      line("A2", "chips", 3, 0, {
        removedUnits: 3,
        removedReason: "destocked",
        priceCents: 175,
        par: 8,
      }),
      line("A2", "pretzels", 0, 8, { priceCents: 200, par: 8 }),
    ]);

    const { intervals, anomalies } = diffVisits({ previous: v1, current: v2 });

    expect(at(intervals, "A2", "chips")?.sold).toEqual({
      status: "known",
      units: 5,
    });
    expect(at(intervals, "A2", "pretzels")?.sold).toEqual({
      status: "unknown",
      reason: "first-visit",
    });
    expect(kinds(anomalies)).not.toContain("product-changed");
  });

  it("diffs each product of a mixed spiral against its own key", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [
      line("A3", "coke", 2, 4),
      line("A3", "sprite", 1, 9),
    ]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [
      line("A3", "coke", 1, 5),
      line("A3", "sprite", 4, 6),
    ]);

    const { intervals } = diffVisits({ previous: v1, current: v2 });

    // coke drew down from 6, sprite from 10 — distinct levels, so keying by
    // slotCode alone would hand coke the wrong baseline.
    expect(at(intervals, "A3", "coke")?.sold).toEqual({ status: "known", units: 5 });
    expect(at(intervals, "A3", "sprite")?.sold).toEqual({ status: "known", units: 6 });
  });

  it("closes a position silently once its level reaches zero", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [
      line("A3", "bar", 4, 0, { removedUnits: 4, removedReason: "destocked" }),
    ]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [line("A3", "gatorade", 0, 6)]);

    const { intervals, anomalies } = diffVisits({ previous: v1, current: v2 });

    expect(at(intervals, "A3", "bar")).toBeUndefined();
    expect(kinds(anomalies)).not.toContain("product-changed");
    expect(kinds(anomalies)).not.toContain("slot-not-counted");
  });

  it("invents nothing from a zero-line visit", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [line("A1", "coke", 2, 8)]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", []);

    const { intervals } = diffVisits({ previous: v1, current: v2 });

    expect(at(intervals, "A1", "coke")?.sold).toEqual({
      status: "unknown",
      reason: "slot-not-counted",
    });
  });
});

describe("diffVisits — removals", () => {
  it("excludes removed units from sold, and from the next baseline", () => {
    // Found 6 chips, binned 2 expired, filled back to 8. Four actually sold.
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [line("A2", "chips", 2, 8)]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [
      line("A2", "chips", 6, 4, { removedUnits: 2, removedReason: "expired" }),
    ]);
    const v3 = visit("v3", "2026-10-19T17:00:00Z", [line("A2", "chips", 2, 8)]);

    const first = diffVisits({ previous: v1, current: v2 }).intervals[0];
    const second = diffVisits({ previous: v2, current: v3 }).intervals[0];

    // Counting AFTER binning would say 6 here, inventing two units of revenue.
    expect(first.sold).toEqual({ status: "known", units: 4 });
    // Counting BEFORE binning without the field would draw from 10, not 8.
    expect(second.sold).toEqual({ status: "known", units: 6 });
  });
});

describe("intervalsForMachine", () => {
  it("returns nothing for no visits", () => {
    expect(intervalsForMachine([])).toEqual({
      intervals: [],
      removals: [],
      anomalies: [],
    });
  });

  it("sums to the true total across a negative then a large interval", () => {
    // 12 units entered the slot and none are left, so 12 sold in total.
    // The -2 is real (stock added outside a visit); clamping it to 0 would
    // overstate the total as 14.
    const visits = [
      visit("v1", "2026-10-05T17:00:00Z", [line("A1", "coke", 0, 10)]),
      visit("v2", "2026-10-12T17:00:00Z", [line("A1", "coke", 12, 2)]),
      visit("v3", "2026-10-19T17:00:00Z", [line("A1", "coke", 0, 0)]),
    ];

    const { intervals } = intervalsForMachine(visits);
    const sold = intervals.map(soldUnits).filter((u) => u !== null);

    expect(sold).toEqual([-2, 14]);
    expect(sold.reduce((sum, units) => sum + units, 0)).toBe(12);
  });

  it("sorts defensively, so reverse-ordered input gives identical output", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [line("A1", "coke", 2, 8)]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [line("A1", "coke", 3, 7)]);

    expect(intervalsForMachine([v2, v1])).toEqual(intervalsForMachine([v1, v2]));
  });

  it("orders by countedAt, not by arrival, so a late-synced visit still slots in", () => {
    // Counted at 9am, submitted at 5pm, after the 2pm visit had already landed.
    const morning = visit("v1", "2026-10-05T09:00:00Z", [line("A1", "coke", 2, 8)], {
      createdAt: "2026-10-05T17:00:00Z",
    });
    const afternoon = visit("v2", "2026-10-05T14:00:00Z", [line("A1", "coke", 3, 7)], {
      createdAt: "2026-10-05T14:05:00Z",
    });

    const { intervals } = intervalsForMachine([afternoon, morning]);
    const known = intervals.filter((i) => i.sold.status === "known");

    expect(known).toHaveLength(1);
    expect(known[0].from).toBe("2026-10-05T09:00:00Z");
    expect(known[0].sold).toEqual({ status: "known", units: 7 });
  });

  it("compares timestamps as instants, not as strings", () => {
    // 09:00+00:00 is 09:00 UTC; 02:00-08:00 is 10:00 UTC. Sorted as strings,
    // "02..." lands first and the baseline is the wrong visit (sold 8, not 7).
    const earlier = visit("v1", "2026-10-05T09:00:00+00:00", [line("A1", "coke", 2, 8)]);
    const later = visit("v2", "2026-10-05T02:00:00-08:00", [line("A1", "coke", 3, 7)]);

    const { intervals } = intervalsForMachine([later, earlier]);
    const known = intervals.filter((i) => i.sold.status === "known");

    expect(known).toHaveLength(1);
    expect(known[0].from).toBe("2026-10-05T09:00:00+00:00");
    expect(known[0].sold).toEqual({ status: "known", units: 7 });
  });

  it("breaks a countedAt tie deterministically on createdAt then id", () => {
    const a = visit("v-b", "2026-10-05T17:00:00Z", [line("A1", "coke", 5, 5)], {
      createdAt: "2026-10-05T18:00:00Z",
    });
    const b = visit("v-a", "2026-10-05T17:00:00Z", [line("A1", "coke", 2, 8)], {
      createdAt: "2026-10-05T17:30:00Z",
    });

    const forwards = intervalsForMachine([a, b]);
    const backwards = intervalsForMachine([b, a]);

    expect(forwards).toEqual(backwards);
    // v-a has the earlier createdAt, so it is the baseline.
    expect(forwards.intervals[0].sold).toEqual({
      status: "unknown",
      reason: "first-visit",
    });
    expect(forwards.intervals[1].sold).toEqual({ status: "known", units: 5 });
  });

  it("collects removals with the visit that made them", () => {
    const visits = [
      visit("v1", "2026-10-05T17:00:00Z", [
        line("A2", "chips", 2, 4, { removedUnits: 2, removedReason: "expired" }),
        line("A3", "bar", 4, 0, { removedUnits: 4, removedReason: "destocked" }),
      ]),
    ];

    expect(intervalsForMachine(visits).removals).toEqual([
      {
        slotCode: "A2",
        productId: "chips",
        visitId: "v1",
        countedAt: "2026-10-05T17:00:00Z",
        units: 2,
        reason: "expired",
      },
      {
        slotCode: "A3",
        productId: "bar",
        visitId: "v1",
        countedAt: "2026-10-05T17:00:00Z",
        units: 4,
        reason: "destocked",
      },
    ]);
  });

  it("records no removal for a line that removed nothing", () => {
    const visits = [visit("v1", "2026-10-05T17:00:00Z", [line("A1", "coke", 2, 8)])];

    expect(intervalsForMachine(visits).removals).toEqual([]);
  });

  it("warns when the slot was filled past par, and still computes", () => {
    const v1 = visit("v1", "2026-10-05T17:00:00Z", [
      line("A1", "coke", 2, 9, { par: 10 }),
    ]);
    const v2 = visit("v2", "2026-10-12T17:00:00Z", [
      line("A1", "coke", 4, 6, { par: 10 }),
    ]);

    const { intervals, anomalies } = intervalsForMachine([v1, v2]);

    expect(anomalies).toContainEqual({
      kind: "over-par",
      slotCode: "A1",
      productId: "coke",
      level: 11,
      par: 10,
    });
    expect(intervals[1].sold).toEqual({ status: "known", units: 7 });
  });

  it("measures over-par against the level after removals, not before", () => {
    // Found 5, binned 2, added 5: the slot ends at par, not over it.
    const visits = [
      visit("v1", "2026-10-05T17:00:00Z", [
        line("A2", "chips", 5, 5, {
          removedUnits: 2,
          removedReason: "expired",
          par: 8,
        }),
      ]),
    ];

    expect(kinds(intervalsForMachine(visits).anomalies)).not.toContain("over-par");
  });

  it("warns when more was removed than was found, and still computes", () => {
    const visits = [
      visit("v1", "2026-10-05T17:00:00Z", [
        line("A2", "chips", 2, 0, { removedUnits: 5, removedReason: "expired" }),
      ]),
    ];

    const { anomalies, removals } = intervalsForMachine(visits);

    expect(anomalies).toContainEqual({
      kind: "over-removed",
      slotCode: "A2",
      productId: "chips",
      remaining: 2,
      removedUnits: 5,
    });
    expect(removals[0].units).toBe(5);
  });

  it("flags removed units with no reason recorded", () => {
    const visits = [
      visit("v1", "2026-10-05T17:00:00Z", [line("A2", "chips", 4, 0, { removedUnits: 2 })]),
    ];

    expect(intervalsForMachine(visits).anomalies).toContainEqual({
      kind: "unknown-removal-reason",
      slotCode: "A2",
      productId: "chips",
      units: 2,
    });
  });

  it("treats a slot first appearing mid-sequence as new, not changed", () => {
    const visits = [
      visit("v1", "2026-10-05T17:00:00Z", [line("A1", "coke", 2, 8)]),
      visit("v2", "2026-10-12T17:00:00Z", [line("A1", "coke", 3, 7)]),
      visit("v3", "2026-10-19T17:00:00Z", [
        line("A1", "coke", 4, 6),
        line("B1", "water", 0, 6),
      ]),
    ];

    const { intervals, anomalies } = intervalsForMachine(visits);

    expect(at(intervals, "B1", "water")?.sold).toEqual({
      status: "unknown",
      reason: "first-visit",
    });
    expect(kinds(anomalies)).not.toContain("product-changed");
  });
});
