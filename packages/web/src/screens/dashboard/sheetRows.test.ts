import { describe, expect, it } from "bun:test";
import type { PnlTotals } from "@vendpire/domain";
import type { ApiPnlSheet } from "../../apiTypes.ts";
import { buildSheetRows } from "./sheetRows.ts";

type SheetLocation = ApiPnlSheet["locations"][number];
type SheetMachine = SheetLocation["machines"][number];

const totals = (over: Partial<PnlTotals> = {}): PnlTotals => ({
  revenueCents: 1000,
  cogsCents: 400,
  grossProfitCents: 600,
  writeOffCents: 0,
  writeOffUnits: 0,
  returnedToStockUnits: 0,
  netProfitCents: 600,
  unknownSoldRows: 0,
  unknownCostRows: 0,
  unknownRemovalReasonRows: 0,
  ...over,
});

const machine = (over: Partial<SheetMachine> = {}): SheetMachine => ({
  machineId: "snack",
  machineName: "Snack",
  items: [
    {
      productId: "coke",
      productName: "Coke 12oz",
      units: 4,
      revenueCents: 600,
      cogsCents: 240,
      grossProfitCents: 360,
    },
    {
      productId: "fritos",
      productName: "Fritos 1oz",
      units: 2,
      revenueCents: 400,
      cogsCents: 160,
      grossProfitCents: 240,
    },
  ],
  pulled: [],
  totals: totals(),
  ...over,
});

const sheet = (locations: SheetLocation[]): ApiPnlSheet => ({
  from: "2026-10-01T05:00:00.000Z",
  to: "2026-11-01T04:59:59.999Z",
  locations,
  totals: totals(),
});

const location = (machines: SheetMachine[]): SheetLocation => ({
  locationId: "gym",
  locationName: "Riverside Gym",
  machines,
  totals: totals(),
});

describe("buildSheetRows", () => {
  it("lays a location out as header, machine, items, then totals", () => {
    const rows = buildSheetRows(sheet([location([machine()])]));

    expect(rows.map((row) => `${row.kind}:${row.label}`)).toEqual([
      "location:Riverside Gym",
      "machine:Snack",
      "item:Coke 12oz",
      "item:Fritos 1oz",
      "total:Machine total",
      "total:Riverside Gym total",
      "total:All machines",
    ]);
  });

  it("sums item units into each total row", () => {
    const rows = buildSheetRows(
      sheet([location([machine(), machine({ machineId: "drink" })])]),
    );

    const unitsByLabel = Object.fromEntries(
      rows
        .filter((row) => row.kind === "total")
        .map((row) => [row.label, row.units]),
    );
    expect(unitsByLabel).toEqual({
      "Machine total": 6,
      "Riverside Gym total": 12,
      "All machines": 12,
    });
  });

  it("puts pulled items after the machine total, then the figure after losses", () => {
    const rows = buildSheetRows(
      sheet([
        location([
          machine({
            pulled: [
              {
                productId: "poptarts",
                productName: "Pop-Tarts",
                units: 3,
                costCents: 240,
              },
            ],
            totals: totals({
              writeOffUnits: 3,
              writeOffCents: 240,
              netProfitCents: 360,
            }),
          }),
        ]),
      ]),
    );

    const machineRows = rows.slice(2, 7);
    expect(machineRows.map((row) => `${row.kind}:${row.label}`)).toEqual([
      "item:Coke 12oz",
      "item:Fritos 1oz",
      "total:Machine total",
      "pulled:Pop-Tarts",
      "net:After pulled items",
    ]);
    expect(machineRows[4]).toMatchObject({ netProfitCents: 360 });
  });

  it("shows the figure after losses when a write-off's cost is unknown", () => {
    const rows = buildSheetRows(
      sheet([
        location([
          machine({
            totals: totals({ writeOffCents: null, netProfitCents: null }),
          }),
        ]),
      ]),
    );

    expect(rows.find((row) => row.kind === "net")).toMatchObject({
      netProfitCents: null,
    });
  });

  it("returns no rows for an empty month", () => {
    expect(buildSheetRows(sheet([]))).toEqual([]);
  });
});
