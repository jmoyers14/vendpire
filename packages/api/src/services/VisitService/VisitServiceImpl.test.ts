import { beforeEach, describe, expect, it } from "bun:test";
import { VisitServiceImpl } from "./VisitServiceImpl.ts";
import type { VisitDraft } from "./VisitService.ts";
import {
  FakeLocationRepository,
  FakeMachineRepository,
  FakePlanogramRepository,
  FakeProductRepository,
  FakePurchaseRepository,
  FakeVisitRepository,
  locationInput,
  machineInput,
  productInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";
const USER = "user_1";

describe("VisitService", () => {
  let visits: FakeVisitRepository;
  let machines: FakeMachineRepository;
  let locations: FakeLocationRepository;
  let products: FakeProductRepository;
  let planograms: FakePlanogramRepository;
  let purchases: FakePurchaseRepository;
  let service: VisitServiceImpl;
  let machineId: string;
  let locationId: string;
  let cokeId: string;
  let fritosId: string;

  beforeEach(() => {
    visits = new FakeVisitRepository();
    machines = new FakeMachineRepository();
    locations = new FakeLocationRepository();
    products = new FakeProductRepository();
    planograms = new FakePlanogramRepository();
    purchases = new FakePurchaseRepository();
    service = new VisitServiceImpl(
      visits,
      machines,
      locations,
      products,
      planograms,
      purchases,
    );

    locationId = locations.seed(ORG, locationInput()).id;
    machineId = machines.seed(
      ORG,
      machineInput({ locationId, slots: [["A1", "A2"]] }),
    ).id;
    cokeId = products.seed(ORG, productInput({ name: "Coke 12oz" })).id;
    fritosId = products.seed(ORG, productInput({ name: "Fritos 1oz" })).id;
  });

  let keySeq = 0;
  const draft = (over: Partial<VisitDraft> = {}): VisitDraft => ({
    machineId,
    locationId,
    planogramId: null,
    countedAt: "2026-09-20T17:00:00.000Z",
    lines: [
      {
        slotCode: "A1",
        productId: cokeId,
        remaining: 4,
        added: 6,
        removed: 0,
        removedReason: null,
        priceCents: 175,
        par: 10,
      },
    ],
    notes: null,
    clientRequestId: `req_${(keySeq += 1)}`,
    ...over,
  });

  const submit = (over: Partial<VisitDraft> = {}) =>
    service.create(ORG, { draft: draft(over), recordedByUserId: USER });

  it("stamps the author from the session, never from the client", async () => {
    const { visit, isReplay, isOutOfOrder } = await submit();
    expect(visit.recordedByUserId).toBe(USER);
    expect(isReplay).toBe(false);
    expect(isOutOfOrder).toBe(false);
  });

  // A visit stored as "a1" would never key-match the same slot counted as "A1",
  // and the engine would report both as uncounted forever.
  it("normalizes slot codes to the form the machine stores", async () => {
    const { visit } = await submit({
      lines: [
        {
          slotCode: " a1 ",
          productId: cokeId,
          remaining: 4,
          added: 6,
          removed: 0,
          removedReason: null,
          priceCents: 175,
          par: 10,
        },
      ],
    });
    expect(visit.lines[0]?.slotCode).toBe("A1");
  });

  it("rejects a slot the machine does not have", async () => {
    await expect(
      submit({
        lines: [
          {
            slotCode: "Z9",
            productId: cokeId,
            remaining: 4,
            added: 6,
            removed: 0,
            removedReason: null,
            priceCents: 175,
            par: 10,
          },
        ],
      }),
    ).rejects.toThrow(/no slot Z9/);
  });

  // The mixed-spiral case, and how a re-planogram visit counts the outgoing
  // product out alongside the incoming one.
  it("accepts one slot carrying two products", async () => {
    const { visit } = await submit({
      lines: [
        {
          slotCode: "A1",
          productId: cokeId,
          remaining: 4,
          added: 0,
          removed: 4,
          removedReason: "destocked",
          priceCents: 175,
          par: 10,
        },
        {
          slotCode: "A1",
          productId: fritosId,
          remaining: 0,
          added: 10,
          removed: 0,
          removedReason: null,
          priceCents: 150,
          par: 10,
        },
      ],
    });
    expect(visit.lines).toHaveLength(2);
  });

  it("rejects the same slot and product twice", async () => {
    await expect(
      submit({
        lines: [
          {
            slotCode: "A1",
            productId: cokeId,
            remaining: 4,
            added: 6,
            removed: 0,
            removedReason: null,
            priceCents: 175,
            par: 10,
          },
          {
            slotCode: "A1",
            productId: cokeId,
            remaining: 2,
            added: 8,
            removed: 0,
            removedReason: null,
            priceCents: 175,
            par: 10,
          },
        ],
      }),
    ).rejects.toThrow(/Duplicate line/);
  });

  it("rejects a line referencing a product that never existed", async () => {
    await expect(
      submit({
        lines: [
          {
            slotCode: "A1",
            productId: "ghost",
            remaining: 4,
            added: 6,
            removed: 0,
            removedReason: null,
            priceCents: 175,
            par: 10,
          },
        ],
      }),
    ).rejects.toThrow(/product/i);
  });

  // The subtlest data-losing bug available: the phone's store has the product,
  // someone retires it in the dashboard, and the outbox submits hours later. A
  // live-only check would 400 permanently and the day's counts would be gone.
  it("accepts a line for a product retired after the count", async () => {
    await products.softDelete(ORG, cokeId);
    const { visit } = await submit();
    expect(visit.lines[0]?.productId).toBe(cokeId);
  });

  it("accepts a count for a machine and location retired after the count", async () => {
    await machines.softDelete(ORG, machineId);
    await locations.softDelete(ORG, locationId);
    const { visit } = await submit();
    expect(visit.machineId).toBe(machineId);
  });

  it("rejects a count stamped more than two hours ahead", async () => {
    const threeHoursOut = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await expect(
      submit({ countedAt: threeHoursOut.toISOString() }),
    ).rejects.toThrow(/future/i);
  });

  it("accepts a count an hour ahead, for a phone whose clock drifts", async () => {
    const anHourOut = new Date(Date.now() + 60 * 60 * 1000);
    const { visit } = await submit({ countedAt: anHourOut.toISOString() });
    expect(visit.id).toBeTruthy();
  });

  describe("idempotency", () => {
    // A client that timed out cannot tell "succeeded, response lost" from
    // "failed". Anything but the original document back makes it either
    // double-post or drop the day's counts.
    it("returns the original visit for a second submit of the same key", async () => {
      const first = await service.create(ORG, {
        draft: draft({ clientRequestId: "req_retry" }),
        recordedByUserId: USER,
      });
      const second = await service.create(ORG, {
        draft: draft({ clientRequestId: "req_retry" }),
        recordedByUserId: USER,
      });

      expect(second.visit.id).toBe(first.visit.id);
      expect(second.isReplay).toBe(true);
      expect(visits.rows).toHaveLength(1);
    });

    // No re-validation on the replay path: the visit is already stored, and
    // re-running the reference checks would start rejecting retries the moment
    // somebody tidied the catalog.
    it("replays a visit whose product has since been retired", async () => {
      const first = await service.create(ORG, {
        draft: draft({ clientRequestId: "req_retry" }),
        recordedByUserId: USER,
      });
      await products.softDelete(ORG, cokeId);
      const second = await service.create(ORG, {
        draft: draft({ clientRequestId: "req_retry" }),
        recordedByUserId: USER,
      });
      expect(second.visit.id).toBe(first.visit.id);
    });

    // Two submits of one draft racing past the pre-check. The unique index is
    // what actually enforces idempotency, so the duplicate-key path has to land
    // on the winner rather than surfacing a 500.
    it("hands back the winner when two submits race the index", async () => {
      const winner = visits.seed(
        ORG,
        { ...draft({ clientRequestId: "req_race" }), recordedByUserId: USER },
      );

      // The pre-check misses exactly once, which is the race: the other request
      // committed between this one's read and its write.
      const realRead = visits.findByClientRequestId.bind(visits);
      let missed = false;
      visits.findByClientRequestId = async (orgId, key) => {
        if (!missed) {
          missed = true;
          return null;
        }
        return realRead(orgId, key);
      };

      const creation = await service.create(ORG, {
        draft: draft({ clientRequestId: "req_race" }),
        recordedByUserId: USER,
      });

      expect(creation.visit.id).toBe(winner.id);
      expect(creation.isReplay).toBe(true);
      expect(visits.rows).toHaveLength(1);
    });
  });

  // Offline-first makes backdating normal: you service at 9am with no signal,
  // someone else services at 2pm and submits first, you sync at 5pm. Both
  // visits happened, so rejecting either destroys real field data.
  it("accepts a backdated visit and reports it as out of order", async () => {
    await submit({ countedAt: "2026-09-21T14:00:00.000Z" });
    const late = await submit({ countedAt: "2026-09-21T09:00:00.000Z" });

    expect(late.isOutOfOrder).toBe(true);
    expect(visits.rows).toHaveLength(2);
  });

  it("does not flag an in-order visit", async () => {
    await submit({ countedAt: "2026-09-21T09:00:00.000Z" });
    const next = await submit({ countedAt: "2026-09-21T14:00:00.000Z" });
    expect(next.isOutOfOrder).toBe(false);
  });

  // Warn only. You really can cram an extra bag in, and removing more than you
  // found is a data-entry slip worth flagging — but the count still gets stored.
  it("stores a visit filled past par, reporting the anomaly", async () => {
    const { visit, anomalies } = await submit({
      lines: [
        {
          slotCode: "A1",
          productId: cokeId,
          remaining: 4,
          added: 9,
          removed: 0,
          removedReason: null,
          priceCents: 175,
          par: 10,
        },
      ],
    });
    expect(visit.id).toBeTruthy();
    expect(anomalies).toEqual([
      {
        kind: "over-par",
        slotCode: "A1",
        productId: cokeId,
        level: 13,
        par: 10,
      },
    ]);
  });

  it("stores a visit that removed more than it found, reporting the anomaly", async () => {
    const { anomalies } = await submit({
      lines: [
        {
          slotCode: "A1",
          productId: cokeId,
          remaining: 2,
          added: 0,
          removed: 5,
          removedReason: "expired",
          priceCents: 175,
          par: 10,
        },
      ],
    });
    expect(anomalies).toContainEqual({
      kind: "over-removed",
      slotCode: "A1",
      productId: cokeId,
      remaining: 2,
      removed: 5,
    });
  });

  describe("snapshot references", () => {
    it("keeps the submitted location and notes that the machine has moved", async () => {
      const elsewhere = locations.seed(ORG, locationInput({ name: "Lobby" }));
      const { visit, notices } = await submit({ locationId: elsewhere.id });

      expect(visit.locationId).toBe(elsewhere.id);
      expect(notices).toEqual([
        {
          kind: "machine-moved",
          submittedLocationId: elsewhere.id,
          machineLocationId: locationId,
        },
      ]);
    });

    it("rejects a location that never existed", async () => {
      await expect(submit({ locationId: "ghost" })).rejects.toThrow(/Location/);
    });

    it("notes a fill against a superseded planogram rather than refusing it", async () => {
      const old = planograms.seed(ORG, {
        machineId,
        effectiveFrom: "2026-08-01T00:00:00.000Z",
        slots: [{ slotCode: "A1", productId: cokeId, par: 10, priceCents: 175 }],
      });
      const current = planograms.seed(ORG, {
        machineId,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        slots: [{ slotCode: "A1", productId: cokeId, par: 10, priceCents: 199 }],
      });

      const { visit, notices } = await submit({ planogramId: old.id });

      expect(visit.planogramId).toBe(old.id);
      expect(notices).toEqual([
        {
          kind: "stale-planogram",
          submittedPlanogramId: old.id,
          currentPlanogramId: current.id,
        },
      ]);
    });

    it("rejects a planogram belonging to another machine", async () => {
      const other = machines.seed(ORG, machineInput({ locationId }));
      const foreign = planograms.seed(ORG, {
        machineId: other.id,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        slots: [{ slotCode: "A1", productId: cokeId, par: 10, priceCents: 175 }],
      });

      await expect(submit({ planogramId: foreign.id })).rejects.toThrow(
        /Planogram/,
      );
    });
  });

  describe("pnl", () => {
    const count = (at: string, remaining: number, added: number) =>
      submit({
        countedAt: at,
        lines: [
          {
            slotCode: "A1",
            productId: cokeId,
            remaining,
            added,
            removed: 0,
            removedReason: null,
            priceCents: 175,
            par: 10,
          },
        ],
      });

    beforeEach(async () => {
      purchases.seed(ORG, {
        purchasedAt: "2026-09-01T00:00:00.000Z",
        vendor: "Costco",
        lines: [{ productId: cokeId, units: 30, totalCostCents: 1499, packId: null }],
        receiptTotalCents: 1499,
        notes: null,
        clientRequestId: "buy_1",
      });
      await count("2026-09-01T17:00:00.000Z", 0, 10);
      await count("2026-09-08T17:00:00.000Z", 4, 6);
      await count("2026-09-15T17:00:00.000Z", 2, 8);
    });

    it("prices every interval against the previous visit's price", async () => {
      const pnl = await service.pnl(ORG, machineId);

      // 10 left behind then 4 found = 6 sold at 175; then 10 behind, 2 found = 8.
      expect(pnl.totals.revenueCents).toBe(6 * 175 + 8 * 175);
      // Rounded once at the end, per interval: 6 and 8 of a 1499/30 basis.
      expect(pnl.totals.cogsCents).toBe(300 + 400);
      expect(pnl.totals.grossProfitCents).toBe(2450 - 700);
      // The first visit has no predecessor, so it carries no sold figure.
      expect(pnl.totals.unknownSoldRows).toBe(1);
    });

    // The baseline both supplies the window's opening figure AND stays out of
    // its report. Count it in and a month opens by declaring the face uncounted.
    it("measures the window against its predecessor without reporting it", async () => {
      const pnl = await service.pnl(ORG, machineId, {
        from: "2026-09-10T00:00:00.000Z",
      });

      expect(pnl.rows.intervals).toHaveLength(1);
      expect(pnl.totals.revenueCents).toBe(8 * 175);
      expect(pnl.totals.cogsCents).toBe(400);
      expect(pnl.totals.unknownSoldRows).toBe(0);
      expect(pnl.anomalies).toEqual([]);
    });

    // Real revenue with an honest null beside it, so the UI can say "profit
    // unavailable: 1 product lacks purchase history" instead of showing a number.
    it("reports unknown COGS as null, never as zero", async () => {
      purchases.rows = [];
      const pnl = await service.pnl(ORG, machineId);

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
      await submit({
        countedAt: "2026-09-22T17:00:00.000Z",
        lines: [
          {
            slotCode: "A1",
            productId: cokeId,
            remaining: 10,
            added: 0,
            removed: 3,
            removedReason: "expired",
            priceCents: 175,
            par: 10,
          },
        ],
      });
      const pnl = await service.pnl(ORG, machineId);

      expect(pnl.totals.writeOffUnits).toBe(3);
      expect(pnl.totals.writeOffCents).toBe(150);
      expect(pnl.totals.netProfitCents).toBe(
        (pnl.totals.grossProfitCents as number) - 150,
      );
    });

    // A removal belongs to the visit it happened on, not to the interval after
    // it — so a write-off on the baseline is last period's loss. Counting it
    // here would charge the same expired units to two reports.
    it("leaves the baseline visit's write-off out of the window", async () => {
      await submit({
        countedAt: "2026-09-18T17:00:00.000Z",
        lines: [
          {
            slotCode: "A2",
            productId: cokeId,
            remaining: 6,
            added: 4,
            removed: 3,
            removedReason: "expired",
            priceCents: 175,
            par: 10,
          },
        ],
      });
      await submit({
        countedAt: "2026-09-25T17:00:00.000Z",
        lines: [
          {
            slotCode: "A2",
            productId: cokeId,
            remaining: 5,
            added: 5,
            removed: 0,
            removedReason: null,
            priceCents: 175,
            par: 10,
          },
        ],
      });

      const window = await service.pnl(ORG, machineId, {
        from: "2026-09-20T00:00:00.000Z",
      });
      expect(window.totals.writeOffUnits).toBe(0);
      expect(window.totals.writeOffCents).toBe(0);

      // Same data, no window: the loss is real and has to show up somewhere.
      const allTime = await service.pnl(ORG, machineId);
      expect(allTime.totals.writeOffUnits).toBe(3);
    });
  });

  it("excludes a removed visit from reads", async () => {
    const { visit } = await submit();
    await service.remove(ORG, visit.id);

    expect(await service.get(ORG, visit.id)).toBeNull();
    expect(await service.list(ORG, {})).toHaveLength(0);
  });

  it("returns the newest visit of every machine", async () => {
    const other = machines.seed(ORG, machineInput({ locationId }));
    await submit({ countedAt: "2026-09-20T09:00:00.000Z" });
    const newest = await submit({ countedAt: "2026-09-21T09:00:00.000Z" });
    await service.create(ORG, {
      draft: draft({ machineId: other.id, countedAt: "2026-09-19T09:00:00.000Z" }),
      recordedByUserId: USER,
    });

    const latest = await service.listLatestByOrg(ORG);
    expect(latest).toHaveLength(2);
    expect(latest.find((v) => v.machineId === machineId)?.id).toBe(newest.visit.id);
  });
});
