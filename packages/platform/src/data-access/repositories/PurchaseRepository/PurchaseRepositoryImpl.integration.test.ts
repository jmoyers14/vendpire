import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { PurchaseModel } from "../../models/Purchase.ts";
import { PurchaseRepositoryImpl } from "./PurchaseRepositoryImpl.ts";

/**
 * The one test that exercises real MongoDB. Everything else about the keyset
 * is covered by pure unit tests, but those can only prove OUR arithmetic —
 * they can't prove that Mongo's $or + sort({purchasedAt:-1,_id:-1}) + limit
 * actually produces the order the cursor assumes, or that Mongoose casts the
 * cursor's _id string to an ObjectId rather than throwing.
 *
 * Skipped by default so a cold `bun run test` never pays for a mongod
 * download. Run it with `bun run test:integration`.
 */
const ENABLED = process.env.VENDPIRE_INTEGRATION === "1";

const ORG = "org_1";
const SHARED = new Date("2026-09-20T12:00:00.000Z");
const OLDER = new Date("2026-09-19T12:00:00.000Z");

describe.skipIf(!ENABLED)("PurchaseRepositoryImpl against MongoDB", () => {
  let mongo: MongoMemoryServer;
  let repo: PurchaseRepositoryImpl;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    // The keyset depends on {orgId, purchasedAt, _id}; autoIndex is on, but
    // build it explicitly so the test can't race the background build.
    await PurchaseModel.syncIndexes();
    repo = new PurchaseRepositoryImpl();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await PurchaseModel.deleteMany({});
  });

  const seed = async (purchasedAt: Date): Promise<string> => {
    const doc = await PurchaseModel.create({
      orgId: ORG,
      purchasedAt,
      vendor: "Costco",
      lines: [{ productId: "p1", units: 1, totalCostCents: 100 }],
    });
    return String(doc._id);
  };

  /** Follows the cursor to exhaustion and returns every id handed out. */
  const pageThrough = async (limit: number): Promise<string[]> => {
    const seen: string[] = [];
    let cursor: { purchasedAt: string; id: string } | null = null;
    for (let request = 0; request < 50; request += 1) {
      const page = await repo.findPageByOrg(ORG, { limit, cursor });
      seen.push(...page.items.map((item) => item.id));
      if (!page.hasMore) {
        return seen;
      }
      const last = page.items.at(-1);
      if (!last) {
        return seen;
      }
      cursor = { purchasedAt: last.purchasedAt, id: last.id };
    }
    throw new Error("paging did not terminate");
  };

  it("pages through rows sharing a purchasedAt without skips or duplicates", async () => {
    const ids = [
      await seed(SHARED),
      await seed(SHARED),
      await seed(SHARED),
      await seed(OLDER),
      await seed(OLDER),
    ];
    const seen = await pageThrough(2);
    expect(new Set(seen).size).toBe(5);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it("agrees with the sort order it claims", async () => {
    await seed(SHARED);
    await seed(SHARED);
    await seed(OLDER);
    const all = await repo.findPageByOrg(ORG, { limit: 10 });
    const sorted = [...all.items].sort(
      (a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.id.localeCompare(a.id),
    );
    expect(all.items.map((item) => item.id)).toEqual(
      sorted.map((item) => item.id),
    );
  });

  // Proves the cursor's 24-hex id survives the trip into $lt as an ObjectId.
  it("casts the cursor id without raising a CastError", async () => {
    const first = await seed(SHARED);
    await seed(OLDER);
    const page = await repo.findPageByOrg(ORG, {
      limit: 10,
      cursor: { purchasedAt: SHARED.toISOString(), id: first },
    });
    expect(page.items.map((item) => item.id)).not.toContain(first);
    expect(page.items).toHaveLength(1);
  });

  it("excludes soft-deleted rows and other orgs", async () => {
    const deleted = await seed(SHARED);
    await PurchaseModel.updateOne({ _id: deleted }, { deletedAt: new Date() });
    await PurchaseModel.create({
      orgId: "org_2",
      purchasedAt: SHARED,
      vendor: "Sam's",
      lines: [{ productId: "p1", units: 1, totalCostCents: 100 }],
    });
    const kept = await seed(OLDER);
    const page = await repo.findPageByOrg(ORG, { limit: 10 });
    expect(page.items.map((item) => item.id)).toEqual([kept]);
  });

  it("honours the date window inclusively", async () => {
    await seed(new Date("2026-09-18T12:00:00.000Z"));
    const inside = await seed(OLDER);
    await seed(new Date("2026-09-25T12:00:00.000Z"));
    const page = await repo.findPageByOrg(ORG, {
      limit: 10,
      from: OLDER.toISOString(),
      to: OLDER.toISOString(),
    });
    expect(page.items.map((item) => item.id)).toEqual([inside]);
  });

  /**
   * The partialFilterExpression on {orgId, clientRequestId}. This is the one
   * claim in the whole slice that unit tests cannot touch and that fails on the
   * SECOND row rather than the first — a plain unique index treats every null
   * as the same value, so the web's keyless purchases would start colliding the
   * moment somebody recorded a second one.
   */
  describe("the clientRequestId partial unique index", () => {
    it("accepts any number of purchases with no key", async () => {
      await seed(SHARED);
      await seed(OLDER);
      await seed(OLDER);
      expect(
        await PurchaseModel.countDocuments({ orgId: ORG, clientRequestId: null }),
      ).toBe(3);
    });

    it("still rejects a duplicate key when one is given", async () => {
      const withKey = (clientRequestId: string) =>
        PurchaseModel.create({
          orgId: ORG,
          purchasedAt: SHARED,
          vendor: "Costco",
          lines: [{ productId: "p1", units: 1, totalCostCents: 100 }],
          clientRequestId,
        });
      await withKey("req_1");
      let code: number | undefined;
      try {
        await withKey("req_1");
      } catch (error) {
        code = (error as { code?: number }).code;
      }
      expect(code).toBe(11000);
    });

    it("finds a purchase by its key, and nothing by a null one", async () => {
      await PurchaseModel.create({
        orgId: ORG,
        purchasedAt: SHARED,
        vendor: "Costco",
        lines: [{ productId: "p1", units: 1, totalCostCents: 100 }],
        clientRequestId: "req_1",
      });
      await seed(OLDER);
      expect((await repo.findByClientRequestId(ORG, "req_1"))?.vendor).toBe("Costco");
      expect(await repo.findByClientRequestId(ORG, "nope")).toBeNull();
    });

    // An edit must not be able to strand the key its submitter still retries
    // under — the PurchaseUpdate type says so, and this proves the impl agrees.
    it("leaves the key untouched across an update", async () => {
      const created = await repo.create(ORG, {
        purchasedAt: SHARED.toISOString(),
        vendor: "Costco",
        lines: [{ productId: "p1", units: 1, totalCostCents: 100, packId: null }],
        receiptTotalCents: null,
        notes: null,
        clientRequestId: "req_1",
      });
      const updated = await repo.update(ORG, created.id, {
        purchasedAt: SHARED.toISOString(),
        vendor: "Sam's",
        lines: [{ productId: "p1", units: 2, totalCostCents: 200, packId: null }],
        receiptTotalCents: null,
        notes: null,
      });
      expect(updated?.vendor).toBe("Sam's");
      expect(updated?.clientRequestId).toBe("req_1");
    });
  });

  // The only way to catch a future index regression: without {orgId,
  // purchasedAt, _id} the planner has to insert a blocking SORT over the whole
  // org's purchases on every page.
  //
  // Asserted on the WINNING plan only. rejectedPlans legitimately contains
  // SORT stages — those are the candidates built on the older two-key index,
  // which is precisely why the third key had to be added.
  it("serves the paged read from an index with no blocking SORT", async () => {
    await seed(SHARED);
    await seed(OLDER);
    const explained = (await PurchaseModel.find({ orgId: ORG, deletedAt: null })
      .sort({ purchasedAt: -1, _id: -1 })
      .limit(3)
      .explain("queryPlanner")) as unknown as {
      queryPlanner: { winningPlan: unknown };
    };
    const winning = JSON.stringify(explained.queryPlanner.winningPlan);
    expect(winning).not.toContain('"stage":"SORT"');
    expect(winning).toContain('"indexName":"orgId_1_purchasedAt_-1__id_-1"');
  });
});
