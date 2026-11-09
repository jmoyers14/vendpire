import { describe, expect, it } from "bun:test";
import type { IntervalPnlRow, PnlRows, RemovalPnlRow } from "@vendpire/domain";
import { buildPnlSheet, type MachinePeriod } from "./pnlSheet.ts";

const sold = (
  productId: string,
  {
    units,
    priceCents = 200,
    cogsCents = units * 50,
    slotCode = "A1",
  }: {
    units: number;
    priceCents?: number;
    cogsCents?: number | null;
    slotCode?: string;
  },
): IntervalPnlRow => ({
  interval: {
    slotCode,
    productId,
    from: "2026-10-01T17:00:00.000Z",
    to: "2026-10-08T17:00:00.000Z",
    sold: { status: "known", units },
    priceCents,
    parAtFill: 10,
  },
  revenueCents: units * priceCents,
  cogsCents,
});

const firstVisit = (productId: string): IntervalPnlRow => ({
  interval: {
    slotCode: "A1",
    productId,
    from: "2026-10-01T17:00:00.000Z",
    to: "2026-10-01T17:00:00.000Z",
    sold: { status: "unknown", reason: "first-visit" },
    priceCents: 200,
    parAtFill: 10,
  },
  revenueCents: 0,
  cogsCents: null,
});

const writtenOff = (
  productId: string,
  { units, costCents }: { units: number; costCents: number | null },
): RemovalPnlRow => ({
  removal: {
    slotCode: "A1",
    productId,
    visitId: "visit-1",
    countedAt: "2026-10-08T17:00:00.000Z",
    units,
    reason: "expired",
  },
  disposition: "written-off",
  costCents,
});

const returnedToStock = (productId: string, units: number): RemovalPnlRow => ({
  removal: {
    slotCode: "A1",
    productId,
    visitId: "visit-1",
    countedAt: "2026-10-08T17:00:00.000Z",
    units,
    reason: "destocked",
  },
  disposition: "returned-to-stock",
});

const period = (
  over: Partial<Omit<MachinePeriod, "rows">> & { rows: Partial<PnlRows> },
): MachinePeriod => ({
  machineId: "mach-1",
  machineName: "Snack machine",
  locationId: "loc-1",
  locationName: "Riverside Gym",
  ...over,
  rows: { intervals: [], removals: [], ...over.rows },
});

const productNames = new Map([
  ["coke", "Coke 12oz"],
  ["fritos", "Fritos 1oz"],
  ["poptarts", "Pop-Tarts"],
]);

describe("buildPnlSheet", () => {
  it("merges one product's slots into a single line", () => {
    const sheet = buildPnlSheet(
      [
        period({
          rows: {
            intervals: [
              sold("coke", { units: 6, slotCode: "A1" }),
              sold("coke", { units: 4, slotCode: "A2" }),
            ],
          },
        }),
      ],
      productNames,
    );

    const items = sheet.locations[0]?.machines[0]?.items;
    expect(items).toEqual([
      {
        productId: "coke",
        productName: "Coke 12oz",
        units: 10,
        revenueCents: 2000,
        cogsCents: 500,
        grossProfitCents: 1500,
      },
    ]);
  });

  it("leaves out a product that sold nothing — a first-visit count is not a sale", () => {
    const sheet = buildPnlSheet(
      [
        period({
          rows: {
            intervals: [
              sold("coke", { units: 3 }),
              firstVisit("fritos"),
              sold("poptarts", { units: 0 }),
            ],
          },
        }),
      ],
      productNames,
    );

    const items = sheet.locations[0]?.machines[0]?.items ?? [];
    expect(items.map((item) => item.productId)).toEqual(["coke"]);
  });

  it("reports an item's cost as unknown when any of its slots lacks one", () => {
    const sheet = buildPnlSheet(
      [
        period({
          rows: {
            intervals: [
              sold("coke", { units: 6, slotCode: "A1" }),
              sold("coke", { units: 4, slotCode: "A2", cogsCents: null }),
            ],
          },
        }),
      ],
      productNames,
    );

    const item = sheet.locations[0]?.machines[0]?.items[0];
    expect(item?.revenueCents).toBe(2000);
    expect(item?.cogsCents).toBeNull();
    expect(item?.grossProfitCents).toBeNull();
  });

  it("lists written-off products as pulled, keeping them out of gross profit", () => {
    const sheet = buildPnlSheet(
      [
        period({
          rows: {
            intervals: [sold("coke", { units: 4 })],
            removals: [
              writtenOff("poptarts", { units: 2, costCents: 160 }),
              writtenOff("poptarts", { units: 1, costCents: 80 }),
              returnedToStock("fritos", 5),
            ],
          },
        }),
      ],
      productNames,
    );

    const machine = sheet.locations[0]?.machines[0];
    expect(machine?.pulled).toEqual([
      {
        productId: "poptarts",
        productName: "Pop-Tarts",
        units: 3,
        costCents: 240,
      },
    ]);
    expect(machine?.totals.grossProfitCents).toBe(800 - 200);
    expect(machine?.totals.netProfitCents).toBe(800 - 200 - 240);
  });

  it("rolls machine totals up into location and grand totals", () => {
    const sheet = buildPnlSheet(
      [
        period({
          machineId: "snack",
          machineName: "Snack",
          rows: { intervals: [sold("fritos", { units: 2 })] },
        }),
        period({
          machineId: "drink",
          machineName: "Drink",
          rows: { intervals: [sold("coke", { units: 3 })] },
        }),
        period({
          machineId: "combo",
          machineName: "Combo",
          locationId: "loc-2",
          locationName: "Oak St Laundromat",
          rows: { intervals: [sold("coke", { units: 5 })] },
        }),
      ],
      productNames,
    );

    const [laundromat, gym] = sheet.locations;
    expect(gym?.totals.revenueCents).toBe((2 + 3) * 200);
    expect(laundromat?.totals.revenueCents).toBe(5 * 200);
    expect(sheet.totals.revenueCents).toBe(10 * 200);
    expect(sheet.totals.grossProfitCents).toBe(10 * 150);
  });

  it("sorts locations, machines and items by name", () => {
    const sheet = buildPnlSheet(
      [
        period({
          machineId: "snack",
          machineName: "Snack",
          rows: {
            intervals: [
              sold("poptarts", { units: 1 }),
              sold("coke", { units: 1 }),
            ],
          },
        }),
        period({
          machineId: "drink",
          machineName: "Drink",
          rows: { intervals: [sold("coke", { units: 1 })] },
        }),
        period({
          machineId: "combo",
          machineName: "Combo",
          locationId: "loc-2",
          locationName: "Oak St Laundromat",
          rows: { intervals: [sold("coke", { units: 1 })] },
        }),
      ],
      productNames,
    );

    expect(sheet.locations.map((location) => location.locationName)).toEqual([
      "Oak St Laundromat",
      "Riverside Gym",
    ]);
    const gym = sheet.locations[1];
    expect(gym?.machines.map((machine) => machine.machineName)).toEqual([
      "Drink",
      "Snack",
    ]);
    expect(gym?.machines[1]?.items.map((item) => item.productName)).toEqual([
      "Coke 12oz",
      "Pop-Tarts",
    ]);
  });

  it("names a product it can't resolve rather than dropping its sales", () => {
    const sheet = buildPnlSheet(
      [period({ rows: { intervals: [sold("ghost", { units: 2 })] } })],
      productNames,
    );

    expect(sheet.locations[0]?.machines[0]?.items[0]?.productName).toBe(
      "Unknown product",
    );
    expect(sheet.totals.revenueCents).toBe(400);
  });

  it("leaves out a machine with nothing sold or pulled", () => {
    const sheet = buildPnlSheet(
      [
        period({
          machineId: "idle",
          rows: { intervals: [firstVisit("coke")], removals: [returnedToStock("coke", 2)] },
        }),
      ],
      productNames,
    );

    expect(sheet.locations).toEqual([]);
  });
});
