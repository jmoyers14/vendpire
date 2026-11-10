import { beforeEach, describe, expect, it } from "bun:test";
import { VisitServiceImpl } from "./VisitServiceImpl.ts";
import type { LayoutChange } from "@vendpire/domain";
import type { VisitLine } from "@vendpire/platform";
import type { VisitDraft } from "./VisitService.ts";
import {
  FakeLocationRepository,
  FakeMachineRepository,
  FakePlanogramRepository,
  FakeProductRepository,
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
    service = new VisitServiceImpl(
      visits,
      machines,
      locations,
      products,
      planograms,
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
        bestBy: null,
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
          bestBy: null,
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
            bestBy: null,
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
          bestBy: null,
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
          bestBy: null,
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
            bestBy: null,
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
            bestBy: null,
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
            bestBy: null,
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
          bestBy: null,
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
          bestBy: null,
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

  describe("adding a product behind", () => {
    let current: ReturnType<typeof planograms.seed>;

    beforeEach(() => {
      current = planograms.seed(ORG, {
        machineId,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        slots: [
          { slotCode: "A1", productId: cokeId, par: 10, priceCents: 175 },
          { slotCode: "A2", productId: cokeId, par: 8, priceCents: 150 },
        ],
      });
    });

    const fritosLine = {
      slotCode: "A1",
      productId: "",
      remaining: 0,
      added: 3,
      removed: 0,
      removedReason: null,
      priceCents: 175,
      par: 10,
      bestBy: null,
    };

    const submitAddingFritos = (over: Partial<VisitDraft> = {}) => {
      const base = draft({ planogramId: current.id, ...over });
      return service.create(ORG, {
        draft: {
          ...base,
          lines: [...base.lines, { ...fritosLine, productId: fritosId }],
        },
        recordedByUserId: USER,
        layoutChanges: [{ kind: "add", slotCode: "a1", productId: fritosId }],
      });
    };

    it("writes the next planogram with the product behind, at the slot's price, from the visit's time", async () => {
      const { planogram } = await submitAddingFritos();

      expect(planogram?.effectiveFrom).toBe("2026-09-20T17:00:00.000Z");
      // Order across slots is not meaningful; within a slot the new product is last.
      expect(planogram?.slots).toHaveLength(3);
      expect(planogram?.slots).toEqual(
        expect.arrayContaining([
          { slotCode: "A1", productId: cokeId, par: 10, priceCents: 175 },
          { slotCode: "A1", productId: fritosId, par: 10, priceCents: 175 },
          { slotCode: "A2", productId: cokeId, par: 8, priceCents: 150 },
        ]),
      );
      expect((await planograms.findCurrentByMachine(ORG, machineId))?.id).toBe(
        planogram?.id,
      );
    });

    it("writes no planogram when nothing was added behind", async () => {
      const { planogram } = await submit({ planogramId: current.id });

      expect(planogram).toBeNull();
      expect(await planograms.countByMachine(ORG, machineId)).toBe(1);
    });

    it("writes the planogram once when the same submit is retried", async () => {
      const clientRequestId = "req_retry";
      await submitAddingFritos({ clientRequestId });

      const retry = await submitAddingFritos({ clientRequestId });

      expect(retry.isReplay).toBe(true);
      expect(retry.planogram).toBeNull();
      expect(await planograms.countByMachine(ORG, machineId)).toBe(2);
    });

    it("refuses when the visit was started against an older planogram", async () => {
      const newer = planograms.seed(ORG, {
        machineId,
        effectiveFrom: "2026-09-10T00:00:00.000Z",
        slots: current.slots,
      });

      await expect(submitAddingFritos()).rejects.toThrow(/reload/i);
      expect((await planograms.findCurrentByMachine(ORG, machineId))?.id).toBe(
        newer.id,
      );
      expect(await visits.findByOrg(ORG)).toHaveLength(0);
    });

    it("refuses a visit dated before the current planogram", async () => {
      await expect(
        submitAddingFritos({ countedAt: "2026-08-20T17:00:00.000Z" }),
      ).rejects.toThrow(/planogram has changed since/i);
      expect(await visits.findByOrg(ORG)).toHaveLength(0);
    });

    it("refuses to add a product the slot already holds", async () => {
      await expect(
        service.create(ORG, {
          draft: draft({ planogramId: current.id }),
          recordedByUserId: USER,
          layoutChanges: [{ kind: "add", slotCode: "A1", productId: cokeId }],
        }),
      ).rejects.toThrow(/already/i);
    });

    it("refuses an added product the visit never counted", async () => {
      await expect(
        service.create(ORG, {
          draft: draft({ planogramId: current.id }),
          recordedByUserId: USER,
          layoutChanges: [{ kind: "add", slotCode: "A1", productId: fritosId }],
        }),
      ).rejects.toThrow(/count/i);
    });

    it("undoes the planogram when the visit write fails", async () => {
      visits.create = async () => {
        throw new Error("connection reset");
      };

      await expect(submitAddingFritos()).rejects.toThrow(/connection reset/);
      expect((await planograms.findCurrentByMachine(ORG, machineId))?.id).toBe(
        current.id,
      );
    });
  });

  describe("layout changes", () => {
    let current: ReturnType<typeof planograms.seed>;

    beforeEach(() => {
      current = planograms.seed(ORG, {
        machineId,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        slots: [
          { slotCode: "A1", productId: cokeId, par: 10, priceCents: 175 },
          { slotCode: "A2", productId: fritosId, par: 10, priceCents: 150 },
        ],
      });
    });

    const line = (over: Partial<VisitLine>): VisitLine => ({
      slotCode: "A1",
      productId: cokeId,
      remaining: 0,
      added: 0,
      removed: 0,
      removedReason: null,
      priceCents: 175,
      par: 10,
      bestBy: null,
      ...over,
    });

    const submitWith = (
      lines: VisitLine[],
      layoutChanges: LayoutChange[],
    ) =>
      service.create(ORG, {
        draft: draft({ planogramId: current.id, lines }),
        recordedByUserId: USER,
        layoutChanges,
      });

    // A function because cokeId is only assigned once beforeEach has run.
    const moveCoke = (): LayoutChange => ({
      kind: "move",
      productId: cokeId,
      fromSlotCode: "A1",
      toSlotCode: "A2",
    });

    it("saves a move: source pulled transferred, destination loaded, planogram moved", async () => {
      const { planogram, visit } = await submitWith(
        [
          line({ remaining: 4, removed: 4, removedReason: "transferred" }),
          line({ slotCode: "A2", remaining: 0, added: 4, priceCents: 150 }),
          line({
            slotCode: "A2",
            productId: fritosId,
            remaining: 2,
            priceCents: 150,
          }),
        ],
        [moveCoke()],
      );

      expect(visit.lines).toHaveLength(3);
      expect(planogram?.slots).toEqual([
        { slotCode: "A2", productId: fritosId, par: 10, priceCents: 150 },
        { slotCode: "A2", productId: cokeId, par: 10, priceCents: 150 },
      ]);
    });

    it("saves a swap and each product takes the other slot's price", async () => {
      const { planogram } = await submitWith(
        [
          line({ remaining: 4, removed: 4, removedReason: "transferred" }),
          line({ slotCode: "A2", added: 4, priceCents: 150 }),
          line({
            slotCode: "A2",
            productId: fritosId,
            remaining: 2,
            removed: 2,
            removedReason: "transferred",
            priceCents: 150,
          }),
          line({ productId: fritosId, added: 2, priceCents: 175 }),
        ],
        [
          moveCoke(),
          {
            kind: "move",
            productId: fritosId,
            fromSlotCode: "A2",
            toSlotCode: "A1",
          },
        ],
      );

      expect(planogram?.slots).toEqual(
        expect.arrayContaining([
          { slotCode: "A2", productId: cokeId, par: 10, priceCents: 150 },
          { slotCode: "A1", productId: fritosId, par: 10, priceCents: 175 },
        ]),
      );
      expect(planogram?.slots).toHaveLength(2);
    });

    it("rejects a move whose source line was not fully removed", async () => {
      await expect(
        submitWith(
          [
            line({ remaining: 4, removed: 1, removedReason: "transferred" }),
            line({ slotCode: "A2", added: 4, priceCents: 150 }),
          ],
          [moveCoke()],
        ),
      ).rejects.toThrow(/A1/);
      expect(await visits.findByOrg(ORG)).toHaveLength(0);
    });

    it("rejects an add into a slot that never had a price without set-price", async () => {
      const emptied = planograms.seed(ORG, {
        machineId,
        effectiveFrom: "2026-09-05T00:00:00.000Z",
        slots: [
          { slotCode: "A1", productId: cokeId, par: 10, priceCents: 175 },
        ],
      });
      const submitAdd = (layoutChanges: LayoutChange[]) =>
        service.create(ORG, {
          draft: draft({
            planogramId: emptied.id,
            lines: [line({ slotCode: "A2", productId: fritosId, added: 3 })],
          }),
          recordedByUserId: USER,
          layoutChanges,
        });
      const addFritos: LayoutChange = {
        kind: "add",
        slotCode: "A2",
        productId: fritosId,
      };

      await expect(submitAdd([addFritos])).rejects.toThrow(/A2.*price/);

      const { planogram } = await submitAdd([
        addFritos,
        { kind: "set-price", slotCode: "A2", priceCents: 200 },
      ]);
      expect(planogram?.slots).toContainEqual({
        slotCode: "A2",
        productId: fritosId,
        par: 10,
        priceCents: 200,
      });
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
  describe("expiringSoon", () => {
    const ASOF = "2026-10-17";

    const line = (over: Record<string, unknown> = {}) => ({
      slotCode: "A1",
      productId: cokeId,
      remaining: 0,
      added: 4,
      removed: 0,
      removedReason: null,
      priceCents: 150,
      par: 10,
      bestBy: null,
      ...over,
    });

    const record = (lines: ReturnType<typeof line>[], over = {}) =>
      service.create(ORG, {
        draft: draft({ lines, ...over } as Partial<VisitDraft>),
        recordedByUserId: USER,
      });

    it("buckets expired, expiring-soon, and beyond the window", async () => {
      const wideId = machines.seed(
        ORG,
        machineInput({ locationId, slots: [["A1", "A2", "A3"]] }),
      ).id;
      await record(
        [
          line({ slotCode: "A1", bestBy: "2026-10-06" }), // expired 11 days ago
          line({ slotCode: "A2", bestBy: "2026-10-20" }), // 3 days out
          line({ slotCode: "A3", bestBy: "2026-12-16" }), // 60 days out
        ],
        { machineId: wideId },
      );

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });

      expect(report.expired.map((r) => r.slotCode)).toEqual(["A1"]);
      expect(report.expiringSoon.map((r) => r.slotCode)).toEqual(["A2"]);
      expect(report.missingDates).toEqual([]);
      expect(report.asOf).toBe(ASOF);
    });

    it("includes both window edges", async () => {
      await record([
        line({ slotCode: "A1", bestBy: ASOF }),
        line({ slotCode: "A2", bestBy: "2026-10-31" }),
      ]);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.expiringSoon.map((r) => r.slotCode)).toEqual(["A1", "A2"]);
    });

    it("orders by bestBy ascending, soonest first", async () => {
      await record([
        line({ slotCode: "A1", bestBy: "2026-10-25" }),
        line({ slotCode: "A2", bestBy: "2026-10-19" }),
      ]);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.expiringSoon.map((r) => r.bestBy)).toEqual([
        "2026-10-19",
        "2026-10-25",
      ]);
    });

    it("reports a stocked, tracked slot with no date as a gap", async () => {
      await record([line({ slotCode: "A1", remaining: 4, added: 0 })]);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.expired).toEqual([]);
      expect(report.expiringSoon).toEqual([]);
      expect(report.missingDates.map((r) => r.slotCode)).toEqual(["A1"]);
      expect(report.missingDates[0]?.bestBy).toBeNull();
      expect(report.missingDates[0]?.daysUntil).toBeNull();
    });

    it("ignores an undated slot whose product does not track expiration", async () => {
      const gumId = products.seed(
        ORG,
        productInput({ name: "Trident", tracksExpiration: false }),
      ).id;
      await record([
        line({ slotCode: "A1", productId: gumId, remaining: 7, added: 3 }),
      ]);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.missingDates).toEqual([]);
    });

    it("excludes a slot with nothing in it", async () => {
      await record([
        line({
          slotCode: "A1",
          remaining: 2,
          added: 0,
          removed: 2,
          removedReason: "expired",
          bestBy: "2026-10-06",
        }),
      ]);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.expired).toEqual([]);
    });

    // A product pulled from the catalog but still in a machine is exactly the
    // stock most likely to go bad.
    it("still reports a retired product", async () => {
      const retiredId = products.seed(ORG, productInput({ name: "Zbar" })).id;
      await record([
        line({ slotCode: "A1", productId: retiredId, bestBy: "2026-10-06" }),
      ]);
      await products.softDelete(ORG, retiredId);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.expired.map((r) => r.productName)).toEqual(["Zbar"]);
    });

    // Only reachable via a hard delete or a corrupt reference — soft-deleted
    // products still come back from findByIdsIncludingDeleted. Dropping the row
    // would hide stock that is physically in a machine.
    it("still reports a slot whose product id resolves to nothing", async () => {
      const goneId = products.seed(ORG, productInput({ name: "Gone" })).id;
      await record([
        line({ slotCode: "A1", productId: goneId, bestBy: "2026-10-06" }),
      ]);
      // A HARD delete, unlike softDelete: findByIdsIncludingDeleted still
      // returns soft-deleted rows, so only this leaves a dangling reference.
      products.rows = products.rows.filter((row) => row.id !== goneId);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.expired.map((r) => r.productName)).toEqual([
        "Unknown product",
      ]);
    });

    it("treats an unknown product as still wanting a date", async () => {
      const goneId = products.seed(ORG, productInput({ name: "Gone" })).id;
      await record([
        line({ slotCode: "A1", productId: goneId, remaining: 4, added: 0 }),
      ]);
      products.rows = products.rows.filter((row) => row.id !== goneId);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.missingDates.map((r) => r.slotCode)).toEqual(["A1"]);
    });

    it("orders missingDates by location, machine and slot", async () => {
      await record([
        line({ slotCode: "A2", remaining: 4, added: 0 }),
        line({ slotCode: "A1", remaining: 4, added: 0 }),
      ]);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.missingDates.map((r) => r.slotCode)).toEqual(["A1", "A2"]);
    });

    it("breaks a date tie by slot rather than leaving it to the driver", async () => {
      await record([
        line({ slotCode: "A2", bestBy: "2026-10-20" }),
        line({ slotCode: "A1", bestBy: "2026-10-20" }),
      ]);

      const report = await service.expiringSoon(ORG, {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report.expiringSoon.map((r) => r.slotCode)).toEqual(["A1", "A2"]);
    });

    it("returns empty buckets for an org with no visits", async () => {
      const report = await service.expiringSoon("org_empty", {
        withinDays: 14,
        asOf: ASOF,
      });
      expect(report).toMatchObject({
        expired: [],
        expiringSoon: [],
        missingDates: [],
      });
    });
  });
});
