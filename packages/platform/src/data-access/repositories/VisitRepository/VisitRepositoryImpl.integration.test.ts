import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { VisitModel } from "../../models/Visit.ts";
import { VisitRepositoryImpl } from "./VisitRepositoryImpl.ts";
import type { VisitInput } from "./VisitRepository.ts";
import type { RemovalReason } from "@vendpire/domain";

/**
 * The claims about visits that only real MongoDB can settle. The pure unit
 * tests prove our filters; they cannot prove that the unique index actually
 * rejects a duplicate key, that Mongo's sort produces the total order the
 * engine assumes, or that the aggregation picks the newest document per
 * machine.
 *
 * Skipped by default so a cold `bun run test` never pays for a mongod
 * download. Run it with `bun run test:integration`.
 */
const ENABLED = process.env.VENDPIRE_INTEGRATION === "1";

const ORG = "org_1";
const MACHINE = "m_1";

describe.skipIf(!ENABLED)("VisitRepositoryImpl against MongoDB", () => {
  let mongo: MongoMemoryServer;
  let repo: VisitRepositoryImpl;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    // The idempotency guarantee IS this index, so build it explicitly rather
    // than racing the background build.
    await VisitModel.syncIndexes();
    repo = new VisitRepositoryImpl();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await VisitModel.deleteMany({});
  });

  const input = (over: Partial<VisitInput> = {}): VisitInput => ({
    machineId: MACHINE,
    locationId: "loc_1",
    planogramId: null,
    countedAt: "2026-09-20T17:00:00.000Z",
    recordedByUserId: "user_1",
    lines: [
      {
        slotCode: "A1",
        productId: "p_1",
        remaining: 4,
        added: 6,
        removedUnits: 0,
        removedReason: null,
        priceCents: 175,
        par: 10,
      },
    ],
    notes: null,
    clientRequestId: "req_1",
    ...over,
  });

  // The whole offline story rests on this. A phone that cannot tell "succeeded,
  // response lost" from "failed" retries; if the index let the retry through,
  // every marginal-signal submit would double-count a machine's sales.
  it("rejects a second visit with the same clientRequestId in the org", async () => {
    await repo.create(ORG, input());
    let code: number | undefined;
    try {
      await repo.create(ORG, input({ countedAt: "2026-09-21T17:00:00.000Z" }));
    } catch (error) {
      code = (error as { code?: number }).code;
    }
    expect(code).toBe(11000);
    expect(await VisitModel.countDocuments({ orgId: ORG })).toBe(1);
  });

  // The index is org-scoped, so two tenants minting the same uuid don't collide.
  it("allows the same clientRequestId in a different org", async () => {
    await repo.create(ORG, input());
    await repo.create("org_2", input());
    expect(await VisitModel.countDocuments({ clientRequestId: "req_1" })).toBe(2);
  });

  it("returns a soft-deleted visit by clientRequestId, so a retry cannot re-create it", async () => {
    const created = await repo.create(ORG, input());
    await repo.softDelete(ORG, created.id);
    expect(await repo.findById(ORG, created.id)).toBeNull();
    const found = await repo.findByClientRequestId(ORG, "req_1");
    expect(found?.id).toBe(created.id);
  });

  it("orders a machine's visits ascending by countedAt", async () => {
    await repo.create(ORG, input({ countedAt: "2026-09-20T17:00:00.000Z", clientRequestId: "b" }));
    await repo.create(ORG, input({ countedAt: "2026-09-10T17:00:00.000Z", clientRequestId: "a" }));
    await repo.create(ORG, input({ countedAt: "2026-09-30T17:00:00.000Z", clientRequestId: "c" }));
    const visits = await repo.findByMachineAscending(ORG, MACHINE);
    expect(visits.map((v) => v.clientRequestId)).toEqual(["a", "b", "c"]);
  });

  // countedAt alone is not a total order: an outbox draining a backlog submits
  // several visits stamped the same minute. Without a stable tiebreaker two
  // reads can pair them differently and yield two sold figures for one interval.
  it("breaks a countedAt tie deterministically across repeated reads", async () => {
    const at = "2026-09-20T17:00:00.000Z";
    for (const key of ["x", "y", "z"]) {
      await repo.create(ORG, input({ countedAt: at, clientRequestId: key }));
    }
    const first = await repo.findByMachineAscending(ORG, MACHINE);
    const second = await repo.findByMachineAscending(ORG, MACHINE);
    expect(first.map((v) => v.id)).toEqual(second.map((v) => v.id));
  });

  /**
   * The reason the port's contract is worded the way it is. Without the
   * predecessor the window's first visit reports `first-visit`, and a real
   * interval's revenue silently becomes zero.
   */
  describe("findByMachineAscending with a from bound", () => {
    const EARLIER = "2026-09-10T17:00:00.000Z";
    const OPENS = "2026-09-20T00:00:00.000Z";
    const INSIDE = "2026-09-25T17:00:00.000Z";

    it("prepends the last visit strictly before the window", async () => {
      await repo.create(ORG, input({ countedAt: EARLIER, clientRequestId: "before" }));
      await repo.create(ORG, input({ countedAt: INSIDE, clientRequestId: "inside" }));
      const visits = await repo.findByMachineAscending(ORG, MACHINE, { from: OPENS });
      expect(visits.map((v) => v.clientRequestId)).toEqual(["before", "inside"]);
    });

    it("prepends only the LAST one before the window, not all of them", async () => {
      await repo.create(ORG, input({ countedAt: "2026-09-01T17:00:00.000Z", clientRequestId: "old" }));
      await repo.create(ORG, input({ countedAt: EARLIER, clientRequestId: "recent" }));
      await repo.create(ORG, input({ countedAt: INSIDE, clientRequestId: "inside" }));
      const visits = await repo.findByMachineAscending(ORG, MACHINE, { from: OPENS });
      expect(visits.map((v) => v.clientRequestId)).toEqual(["recent", "inside"]);
    });

    // $lte in the predecessor read would return this visit twice and make the
    // engine pair it against itself for a zero-length interval.
    it("does not duplicate a visit stamped exactly at from", async () => {
      await repo.create(ORG, input({ countedAt: OPENS, clientRequestId: "at-edge" }));
      await repo.create(ORG, input({ countedAt: INSIDE, clientRequestId: "inside" }));
      const visits = await repo.findByMachineAscending(ORG, MACHINE, { from: OPENS });
      expect(visits.map((v) => v.clientRequestId)).toEqual(["at-edge", "inside"]);
    });

    it("returns just the window when nothing precedes it", async () => {
      await repo.create(ORG, input({ countedAt: INSIDE, clientRequestId: "inside" }));
      const visits = await repo.findByMachineAscending(ORG, MACHINE, { from: OPENS });
      expect(visits.map((v) => v.clientRequestId)).toEqual(["inside"]);
    });

    it("never crosses to another machine for the predecessor", async () => {
      await repo.create(ORG, input({ machineId: "m_2", countedAt: EARLIER, clientRequestId: "other" }));
      await repo.create(ORG, input({ countedAt: INSIDE, clientRequestId: "inside" }));
      const visits = await repo.findByMachineAscending(ORG, MACHINE, { from: OPENS });
      expect(visits.map((v) => v.clientRequestId)).toEqual(["inside"]);
    });
  });

  describe("findLatestByOrg", () => {
    it("returns the newest visit of every machine, one each", async () => {
      await repo.create(ORG, input({ countedAt: "2026-09-10T17:00:00.000Z", clientRequestId: "m1-old" }));
      await repo.create(ORG, input({ countedAt: "2026-09-30T17:00:00.000Z", clientRequestId: "m1-new" }));
      await repo.create(ORG, input({ machineId: "m_2", countedAt: "2026-09-12T17:00:00.000Z", clientRequestId: "m2-only" }));
      const latest = await repo.findLatestByOrg(ORG);
      expect(latest.map((v) => v.clientRequestId).sort()).toEqual(["m1-new", "m2-only"]);
    });

    it("excludes soft-deleted visits", async () => {
      const created = await repo.create(ORG, input());
      await repo.softDelete(ORG, created.id);
      expect(await repo.findLatestByOrg(ORG)).toEqual([]);
    });

    it("leaves other orgs alone", async () => {
      await repo.create("org_2", input());
      expect(await repo.findLatestByOrg(ORG)).toEqual([]);
    });
  });

  it("stores removals as given, with removedUnits defaulting to 0", async () => {
    const created = await repo.create(
      ORG,
      input({
        lines: [
          { slotCode: "A1", productId: "p_1", remaining: 6, added: 7, removedUnits: 3, removedReason: "expired", priceCents: 175, par: 10 },
          { slotCode: "A2", productId: "p_2", remaining: 2, added: 8, removedUnits: 0, removedReason: null, priceCents: 150, par: 10 },
        ],
      }),
    );
    expect(created.lines[0]).toMatchObject({ removedUnits: 3, removedReason: "expired" });
    expect(created.lines[1]).toMatchObject({ removedUnits: 0, removedReason: null });
  });

  // The schema enum is the last line of defence if a caller skips validation.
  it("rejects a removedReason outside the enum", async () => {
    const bad = input({
      lines: [
        // Not a RemovalReason — the cast is what lets the schema do the rejecting.
        { slotCode: "A1", productId: "p_1", remaining: 1, added: 0, removedUnits: 1, removedReason: "stolen" as unknown as RemovalReason, priceCents: 175, par: null },
      ],
    });
    await expect(repo.create(ORG, bad)).rejects.toThrow();
  });
});
