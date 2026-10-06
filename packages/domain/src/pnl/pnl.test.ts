import { describe, expect, it } from "bun:test";
import { buildCostBasis } from "../costs/unitCost.ts";
import type { CostBasisLine } from "../costs/unitCost.ts";
import type { SlotInterval, SlotRemoval, SoldUnits } from "../visits/sold.ts";
import type { RemovalReason } from "../visits/removals.ts";
import { buildIntervalPnl, buildPnlTotals } from "./pnl.ts";

const FROM = "2026-10-05T17:00:00Z";
const TO = "2026-10-12T17:00:00Z";

const sold = (units: number): SoldUnits => ({ status: "known", units });
const unsold: SoldUnits = { status: "unknown", reason: "first-visit" };

const interval = (
  slotCode: string,
  productId: string,
  soldUnits: SoldUnits,
  priceCents: number,
): SlotInterval => ({
  slotCode,
  productId,
  from: FROM,
  to: TO,
  sold: soldUnits,
  priceCents,
  parAtFill: null,
});

const removal = (
  productId: string,
  units: number,
  reason: RemovalReason | null,
): SlotRemoval => ({
  slotCode: "A2",
  productId,
  visitId: "v2",
  countedAt: TO,
  units,
  reason,
});

const purchase = (
  productId: string,
  units: number,
  totalCostCents: number,
): CostBasisLine => ({ productId, units, totalCostCents });

// coke: 36 units for 1898c. chips: 12 units for 899c. "bar" has no history.
const BASIS = buildCostBasis([
  purchase("coke", 24, 1199),
  purchase("coke", 12, 699),
  purchase("chips", 12, 899),
]);

const totalsFor = (
  intervals: SlotInterval[],
  removals: SlotRemoval[] = [],
) => buildPnlTotals(buildIntervalPnl(intervals, removals, BASIS).rows);

describe("buildIntervalPnl", () => {
  it("prices revenue at the interval's own price", () => {
    const { rows } = buildIntervalPnl(
      [interval("A1", "coke", sold(7), 150)],
      [],
      BASIS,
    );

    expect(rows.intervals[0].revenueCents).toBe(1050);
    expect(rows.intervals[0].cogsCents).toBe(369); // round(7 × 1898/36)
  });

  it("gives an unknown-sold interval no revenue and no cost", () => {
    const { rows } = buildIntervalPnl(
      [interval("A1", "coke", unsold, 150)],
      [],
      BASIS,
    );

    expect(rows.intervals[0].revenueCents).toBe(0);
    expect(rows.intervals[0].cogsCents).toBeNull();
  });

  it("reports an unknown cost once per product, not once per slot", () => {
    const { anomalies } = buildIntervalPnl(
      [
        interval("A3", "bar", sold(2), 250),
        interval("B3", "bar", sold(1), 250),
      ],
      [],
      BASIS,
    );

    expect(anomalies).toEqual([{ kind: "unknown-cost", productId: "bar" }]);
  });

  it("omits the cost field entirely from a returned-to-stock removal", () => {
    const { rows } = buildIntervalPnl([], [removal("chips", 3, "destocked")], BASIS);

    expect(rows.removals[0]).toEqual({
      removal: removal("chips", 3, "destocked"),
      disposition: "returned-to-stock",
    });
    expect(rows.removals[0]).not.toHaveProperty("costCents");
  });

  it("costs a written-off removal at the weighted average", () => {
    const { rows } = buildIntervalPnl([], [removal("chips", 2, "expired")], BASIS);

    expect(rows.removals[0]).toEqual({
      removal: removal("chips", 2, "expired"),
      disposition: "written-off",
      costCents: 150, // round(2 × 899/12)
    });
  });

  it("leaves a removal with no reason without a disposition", () => {
    const { rows } = buildIntervalPnl([], [removal("chips", 2, null)], BASIS);

    expect(rows.removals[0]).toEqual({
      removal: removal("chips", 2, null),
      disposition: null,
    });
  });
});

describe("buildPnlTotals", () => {
  it("sums a hand-computed happy path", () => {
    const totals = totalsFor([
      interval("A1", "coke", sold(7), 150),
      interval("A2", "chips", sold(3), 175),
    ]);

    expect(totals).toEqual({
      revenueCents: 1575, // 1050 + 525
      cogsCents: 594, //    369 + 225
      grossProfitCents: 981,
      writeOffCents: 0,
      writeOffUnits: 0,
      returnedToStockUnits: 0,
      netProfitCents: 981,
      unknownSoldRows: 0,
      unknownCostRows: 0,
      unknownRemovalReasonRows: 0,
    });
  });

  it("returns zeroes rather than throwing when there is nothing to sum", () => {
    expect(totalsFor([])).toEqual({
      revenueCents: 0,
      cogsCents: 0,
      grossProfitCents: 0,
      writeOffCents: 0,
      writeOffUnits: 0,
      returnedToStockUnits: 0,
      netProfitCents: 0,
      unknownSoldRows: 0,
      unknownCostRows: 0,
      unknownRemovalReasonRows: 0,
    });
  });

  it("nulls COGS and both profits when ANY row's cost is unknown — but keeps revenue real", () => {
    const totals = totalsFor([
      interval("A1", "coke", sold(7), 150),
      interval("A3", "bar", sold(2), 250),
    ]);

    // A partially-known COGS shown as a number is a lie that yields
    // confidently wrong profit. The revenue was really collected, though.
    expect(totals.revenueCents).toBe(1550); // 1050 + 500
    expect(totals.cogsCents).toBeNull();
    expect(totals.grossProfitCents).toBeNull();
    expect(totals.netProfitCents).toBeNull();
    expect(totals.unknownCostRows).toBe(1);
  });

  it("never reports a partial COGS sum", () => {
    const totals = totalsFor([
      interval("A1", "coke", sold(7), 150),
      interval("A3", "bar", sold(2), 250),
    ]);

    expect(totals.cogsCents).not.toBe(369);
  });

  it("excludes an unknown-sold row from the totals and counts it", () => {
    const totals = totalsFor([
      interval("A1", "coke", sold(7), 150),
      interval("B1", "water", unsold, 200),
    ]);

    expect(totals.revenueCents).toBe(1050);
    expect(totals.cogsCents).toBe(369);
    expect(totals.unknownSoldRows).toBe(1);
    expect(totals.unknownCostRows).toBe(0);
  });

  it("charges an expired write-off to net profit but not to gross", () => {
    const totals = totalsFor(
      [interval("A2", "chips", sold(3), 175)],
      [removal("chips", 2, "expired")],
    );

    expect(totals.grossProfitCents).toBe(300); // 525 − 225
    expect(totals.writeOffCents).toBe(150);
    expect(totals.writeOffUnits).toBe(2);
    expect(totals.netProfitCents).toBe(150); // 300 − 150
  });

  it("charges a destocked removal to neither, and counts the units", () => {
    const totals = totalsFor(
      [interval("A2", "chips", sold(3), 175)],
      [removal("chips", 2, "destocked")],
    );

    // Still your inventory — its COGS lands wherever those units sell.
    expect(totals.grossProfitCents).toBe(300);
    expect(totals.netProfitCents).toBe(300);
    expect(totals.writeOffCents).toBe(0);
    expect(totals.writeOffUnits).toBe(0);
    expect(totals.returnedToStockUnits).toBe(2);
  });

  it("treats a transfer exactly as it treats a destock", () => {
    const destocked = totalsFor([], [removal("chips", 2, "destocked")]);
    const transferred = totalsFor([], [removal("chips", 2, "transferred")]);

    expect(transferred).toEqual(destocked);
  });

  it("treats damaged and recalled exactly as it treats expired", () => {
    const expired = totalsFor([], [removal("chips", 2, "expired")]);

    expect(totalsFor([], [removal("chips", 2, "damaged")])).toEqual(expired);
    expect(totalsFor([], [removal("chips", 2, "recalled")])).toEqual(expired);
  });

  it("nulls net profit for an unknown-cost write-off while gross stays real", () => {
    const totals = totalsFor(
      [interval("A1", "coke", sold(7), 150)],
      [removal("bar", 3, "expired")],
    );

    expect(totals.grossProfitCents).toBe(681); // 1050 − 369
    expect(totals.writeOffCents).toBeNull();
    expect(totals.writeOffUnits).toBe(3);
    expect(totals.netProfitCents).toBeNull();
  });

  it("nulls the write-off when a removal's disposition is unknowable", () => {
    const totals = totalsFor(
      [interval("A1", "coke", sold(7), 150)],
      [removal("chips", 2, null)],
    );

    // Loss or transfer is a coin flip without the reason, and guessing either
    // way overstates the loss or hides it.
    expect(totals.writeOffCents).toBeNull();
    expect(totals.netProfitCents).toBeNull();
    expect(totals.grossProfitCents).toBe(681);
    expect(totals.unknownRemovalReasonRows).toBe(1);
    expect(totals.returnedToStockUnits).toBe(0);
  });

  it("keeps negative sold negative all the way through to profit", () => {
    const totals = totalsFor([interval("A1", "coke", sold(-2), 150)]);

    expect(totals.revenueCents).toBe(-300);
    expect(totals.cogsCents).toBe(-105); // round(-2 × 1898/36)
    expect(totals.netProfitCents).toBe(-195);
  });
});
