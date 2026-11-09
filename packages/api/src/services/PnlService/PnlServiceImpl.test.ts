import { beforeEach, describe, expect, it } from "bun:test";
import type { RemovalReason } from "@vendpire/domain";
import { PnlServiceImpl } from "./PnlServiceImpl.ts";
import {
  FakeLocationRepository,
  FakeMachineRepository,
  FakeProductRepository,
  FakePurchaseRepository,
  FakeVisitRepository,
  locationInput,
  machineInput,
  productInput,
  visitInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";
const OCTOBER = {
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-10-31T23:59:59.999Z",
};

describe("PnlService", () => {
  let visits: FakeVisitRepository;
  let machines: FakeMachineRepository;
  let locations: FakeLocationRepository;
  let products: FakeProductRepository;
  let purchases: FakePurchaseRepository;
  let service: PnlServiceImpl;
  let machineId: string;
  let locationId: string;
  let cokeId: string;

  beforeEach(() => {
    visits = new FakeVisitRepository();
    machines = new FakeMachineRepository();
    locations = new FakeLocationRepository();
    products = new FakeProductRepository();
    purchases = new FakePurchaseRepository();
    service = new PnlServiceImpl(
      visits,
      machines,
      locations,
      products,
      purchases,
    );

    locationId = locations.seed(ORG, locationInput({ name: "Riverside Gym" })).id;
    machineId = machines.seed(
      ORG,
      machineInput({ name: "Snack", locationId, slots: [["A1", "A2"]] }),
    ).id;
    cokeId = products.seed(ORG, productInput({ name: "Coke 12oz" })).id;
    purchases.seed(ORG, {
      purchasedAt: "2026-09-01T00:00:00.000Z",
      vendor: "Costco",
      lines: [{ productId: cokeId, units: 30, totalCostCents: 1499, packId: null }],
      receiptTotalCents: 1499,
      notes: null,
      clientRequestId: "buy_1",
    });
  });

  let keySeq = 0;
  const count = (
    countedAt: string,
    {
      remaining,
      added,
      removed = 0,
      removedReason = null,
      slotCode = "A1",
      machine = machineId,
      location = locationId,
    }: {
      remaining: number;
      added: number;
      removed?: number;
      removedReason?: RemovalReason | null;
      slotCode?: string;
      machine?: string;
      location?: string;
    },
  ) =>
    visits.seed(
      ORG,
      visitInput({
        machineId: machine,
        locationId: location,
        countedAt,
        clientRequestId: `req_${(keySeq += 1)}`,
        lines: [
          {
            slotCode,
            productId: cokeId,
            remaining,
            added,
            removed,
            removedReason,
            priceCents: 175,
            par: 10,
            bestBy: null,
          },
        ],
      }),
    );

  describe("byMachine", () => {
    beforeEach(() => {
      count("2026-09-01T17:00:00.000Z", { remaining: 0, added: 10 });
      count("2026-09-08T17:00:00.000Z", { remaining: 4, added: 6 });
      count("2026-09-15T17:00:00.000Z", { remaining: 2, added: 8 });
    });

    it("prices every interval against the previous visit's price", async () => {
      const pnl = await service.byMachine(ORG, machineId);

      // 10 left behind then 4 found = 6 sold at 175; then 10 behind, 2 found = 8.
      expect(pnl.totals.revenueCents).toBe(6 * 175 + 8 * 175);
      // Rounded once at the end, per interval: 6 and 8 of a 1499/30 basis.
      expect(pnl.totals.cogsCents).toBe(300 + 400);
      expect(pnl.totals.grossProfitCents).toBe(2450 - 700);
      expect(pnl.totals.unknownSoldRows).toBe(1);
    });

    // The baseline both supplies the window's opening figure AND stays out of
    // its report. Count it in and a month opens by declaring the face uncounted.
    it("measures the window against its predecessor without reporting it", async () => {
      const pnl = await service.byMachine(ORG, machineId, {
        from: "2026-09-10T00:00:00.000Z",
      });

      expect(pnl.rows.intervals).toHaveLength(1);
      expect(pnl.totals.revenueCents).toBe(8 * 175);
      expect(pnl.totals.cogsCents).toBe(400);
      expect(pnl.totals.unknownSoldRows).toBe(0);
      expect(pnl.anomalies).toEqual([]);
    });

    it("reports unknown COGS as null, never as zero", async () => {
      purchases.rows = [];
      const pnl = await service.byMachine(ORG, machineId);

      expect(pnl.totals.revenueCents).toBe(2450);
      expect(pnl.totals.cogsCents).toBeNull();
      expect(pnl.totals.grossProfitCents).toBeNull();
      expect(pnl.totals.unknownCostRows).toBe(2);
      expect(pnl.anomalies).toContainEqual({
        kind: "unknown-cost",
        productId: cokeId,
      });
    });

    it("costs an expiry against net profit but not gross", async () => {
      count("2026-09-22T17:00:00.000Z", {
        remaining: 10,
        added: 0,
        removed: 3,
        removedReason: "expired",
      });
      const pnl = await service.byMachine(ORG, machineId);

      expect(pnl.totals.writeOffUnits).toBe(3);
      expect(pnl.totals.writeOffCents).toBe(150);
      expect(pnl.totals.netProfitCents).toBe(
        (pnl.totals.grossProfitCents as number) - 150,
      );
    });

    // A removal belongs to the visit it happened on, so a write-off on the
    // baseline is last period's loss and must not be charged to this one too.
    it("leaves the baseline visit's write-off out of the window", async () => {
      count("2026-09-18T17:00:00.000Z", {
        slotCode: "A2",
        remaining: 6,
        added: 4,
        removed: 3,
        removedReason: "expired",
      });
      count("2026-09-25T17:00:00.000Z", {
        slotCode: "A2",
        remaining: 5,
        added: 5,
      });

      const window = await service.byMachine(ORG, machineId, {
        from: "2026-09-20T00:00:00.000Z",
      });
      expect(window.totals.writeOffUnits).toBe(0);
      expect(window.totals.writeOffCents).toBe(0);

      const allTime = await service.byMachine(ORG, machineId);
      expect(allTime.totals.writeOffUnits).toBe(3);
    });
  });

  describe("sheet", () => {
    it("counts a stretch in the month its closing visit falls in", async () => {
      count("2026-09-25T17:00:00.000Z", { remaining: 0, added: 10 });
      count("2026-10-03T17:00:00.000Z", { remaining: 4, added: 6 });
      count("2026-11-02T17:00:00.000Z", { remaining: 1, added: 9 });

      const sheet = await service.sheet(ORG, OCTOBER);

      const item = sheet.locations[0]?.machines[0]?.items[0];
      expect(item).toEqual({
        productId: cokeId,
        productName: "Coke 12oz",
        units: 6,
        revenueCents: 6 * 175,
        cogsCents: 300,
        grossProfitCents: 6 * 175 - 300,
      });
      expect(sheet.from).toBe(OCTOBER.from);
      expect(sheet.to).toBe(OCTOBER.to);
    });

    it("files a moved machine under the location of its last visit in the month", async () => {
      const laundromatId = locations.seed(
        ORG,
        locationInput({ name: "Oak St Laundromat" }),
      ).id;
      count("2026-10-01T17:00:00.000Z", { remaining: 0, added: 10 });
      count("2026-10-08T17:00:00.000Z", {
        remaining: 4,
        added: 6,
        location: laundromatId,
      });

      const sheet = await service.sheet(ORG, OCTOBER);

      expect(sheet.locations).toHaveLength(1);
      expect(sheet.locations[0]?.locationName).toBe("Oak St Laundromat");
      expect(sheet.locations[0]?.machines[0]?.machineName).toBe("Snack");
    });

    it("still reports a machine deleted after the month", async () => {
      count("2026-10-01T17:00:00.000Z", { remaining: 0, added: 10 });
      count("2026-10-08T17:00:00.000Z", { remaining: 4, added: 6 });
      await machines.softDelete(ORG, machineId);
      await locations.softDelete(ORG, locationId);

      const sheet = await service.sheet(ORG, OCTOBER);

      expect(sheet.locations[0]?.locationName).toBe("Riverside Gym");
      expect(sheet.locations[0]?.machines[0]?.machineName).toBe("Snack");
      expect(sheet.totals.revenueCents).toBe(6 * 175);
    });

    it("rolls every machine into one grand total", async () => {
      const drinkId = machines.seed(
        ORG,
        machineInput({ name: "Drink", locationId, slots: [["A1"]] }),
      ).id;
      count("2026-10-01T17:00:00.000Z", { remaining: 0, added: 10 });
      count("2026-10-08T17:00:00.000Z", { remaining: 4, added: 6 });
      count("2026-10-01T17:00:00.000Z", { remaining: 0, added: 10, machine: drinkId });
      count("2026-10-08T17:00:00.000Z", { remaining: 8, added: 2, machine: drinkId });

      const sheet = await service.sheet(ORG, OCTOBER);

      expect(sheet.locations[0]?.machines.map((m) => m.machineName)).toEqual([
        "Drink",
        "Snack",
      ]);
      expect(sheet.totals.revenueCents).toBe((6 + 2) * 175);
    });

    it("returns an empty sheet for a month with no visits", async () => {
      count("2026-09-01T17:00:00.000Z", { remaining: 0, added: 10 });

      const sheet = await service.sheet(ORG, OCTOBER);

      expect(sheet.locations).toEqual([]);
      expect(sheet.totals.revenueCents).toBe(0);
    });
  });
});
