import { beforeEach, describe, expect, it } from "bun:test";
import { PurchaseServiceImpl } from "./PurchaseServiceImpl.ts";
import {
  FakePackRepository,
  FakeProductRepository,
  FakePurchaseRepository,
  productInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("PurchaseService", () => {
  let purchases: FakePurchaseRepository;
  let products: FakeProductRepository;
  let packs: FakePackRepository;
  let service: PurchaseServiceImpl;
  let cokeId: string;
  let fritosId: string;

  beforeEach(() => {
    purchases = new FakePurchaseRepository();
    products = new FakeProductRepository();
    packs = new FakePackRepository();
    service = new PurchaseServiceImpl(purchases, products, packs);
    cokeId = products.seed(ORG, productInput({ name: "Coke 12oz" })).id;
    fritosId = products.seed(ORG, productInput({ name: "Fritos 1oz" })).id;
  });

  const draft = (over: Record<string, unknown> = {}) => ({
    purchasedAt: "2026-09-20T00:00:00.000Z",
    vendor: " Costco ",
    lines: [{ productId: cokeId, units: 30, totalCostCents: 1499 }],
    notes: null,
    ...over,
  });

  it("creates a purchase from direct unit lines", async () => {
    const created = await service.create(ORG, draft());
    expect(created.vendor).toBe("Costco");
    expect(created.lines[0]?.totalCostCents).toBe(1499);
    expect(created.lines[0]?.packId).toBeNull();
  });

  it("rejects lines referencing unknown products", async () => {
    await expect(
      service.create(
        ORG,
        draft({ lines: [{ productId: "ghost", units: 30, totalCostCents: 1499 }] }),
      ),
    ).rejects.toThrow(/product/i);
  });

  it("rejects a draft with no lines at all", async () => {
    await expect(
      service.create(ORG, draft({ lines: [], packLines: [] })),
    ).rejects.toThrow(/line/i);
  });

  it("expands a single-product pack line into units", async () => {
    const pack = packs.seed(ORG, {
      name: "Coke 35pk",
      barcodes: [],
      contents: [{ productId: cokeId, units: 35 }],
      active: true,
    });
    const created = await service.create(
      ORG,
      draft({
        lines: [],
        packLines: [{ packId: pack.id, qty: 2, totalCostCents: 3978 }],
      }),
    );
    expect(created.lines).toHaveLength(1);
    expect(created.lines[0]).toMatchObject({
      productId: cokeId,
      units: 70,
      totalCostCents: 3978,
      packId: pack.id,
    });
  });

  it("splits a variety pack's cost by unit count, summing exactly", async () => {
    const pack = packs.seed(ORG, {
      name: "Variety 30ct",
      barcodes: [],
      contents: [
        { productId: cokeId, units: 10 },
        { productId: fritosId, units: 20 },
      ],
      active: true,
    });
    const created = await service.create(
      ORG,
      draft({
        lines: [],
        packLines: [{ packId: pack.id, qty: 1, totalCostCents: 1699 }],
      }),
    );
    expect(created.lines.map((line) => line.units)).toEqual([10, 20]);
    // $16.99 over 10 + 20 units → 566.33 / 1132.67; the leftover penny goes
    // to the larger fractional part, and the parts sum to the receipt exactly.
    expect(created.lines.map((line) => line.totalCostCents)).toEqual([566, 1133]);
    expect(
      created.lines.reduce((sum, line) => sum + line.totalCostCents, 0),
    ).toBe(1699);
  });

  it("keeps direct and expanded lines side by side", async () => {
    const pack = packs.seed(ORG, {
      name: "Coke 35pk",
      barcodes: [],
      contents: [{ productId: cokeId, units: 35 }],
      active: true,
    });
    const created = await service.create(
      ORG,
      draft({ packLines: [{ packId: pack.id, qty: 1, totalCostCents: 1989 }] }),
    );
    expect(created.lines).toHaveLength(2);
  });

  it("rejects an unknown pack in a pack line", async () => {
    await expect(
      service.create(
        ORG,
        draft({
          lines: [],
          packLines: [{ packId: "ghost", qty: 1, totalCostCents: 100 }],
        }),
      ),
    ).rejects.toThrow(/pack/i);
  });

  it("rejects a pack quantity below one", async () => {
    const pack = packs.seed(ORG, {
      name: "Coke 35pk",
      barcodes: [],
      contents: [{ productId: cokeId, units: 35 }],
      active: true,
    });
    await expect(
      service.create(
        ORG,
        draft({
          lines: [],
          packLines: [{ packId: pack.id, qty: 0, totalCostCents: 100 }],
        }),
      ),
    ).rejects.toThrow(/quantity/i);
  });

  it("rejects provenance packIds that don't exist", async () => {
    await expect(
      service.create(
        ORG,
        draft({
          lines: [
            { productId: cokeId, units: 5, totalCostCents: 500, packId: "ghost" },
          ],
        }),
      ),
    ).rejects.toThrow(/pack/i);
  });

  it("stores the receipt total when given", async () => {
    const created = await service.create(ORG, draft({ receiptTotalCents: 1499 }));
    expect(created.receiptTotalCents).toBe(1499);
  });

  describe("list", () => {
    /** Seeds one purchase per given instant and returns the created ids. */
    const seedOn = async (instants: string[]): Promise<string[]> => {
      const ids: string[] = [];
      for (const purchasedAt of instants) {
        const created = await service.create(ORG, draft({ purchasedAt }));
        ids.push(created.id);
      }
      return ids;
    };

    /** Follows nextCursor to exhaustion and returns every id handed out. */
    const pageThrough = async (limit: number): Promise<string[]> => {
      const seen: string[] = [];
      let cursor: string | null = null;
      // Bounded so a broken cursor fails as a test rather than hanging.
      for (let request = 0; request < 50; request += 1) {
        const page = await service.list(ORG, { limit, cursor });
        seen.push(...page.items.map((item) => item.id));
        if (!page.nextCursor) {
          return seen;
        }
        cursor = page.nextCursor;
      }
      throw new Error("list did not terminate");
    };

    it("returns newest first", async () => {
      await seedOn([
        "2026-09-18T12:00:00.000Z",
        "2026-09-20T12:00:00.000Z",
        "2026-09-19T12:00:00.000Z",
      ]);
      const page = await service.list(ORG, {});
      expect(page.items.map((item) => item.purchasedAt)).toEqual([
        "2026-09-20T12:00:00.000Z",
        "2026-09-19T12:00:00.000Z",
        "2026-09-18T12:00:00.000Z",
      ]);
    });

    it("defaults to a page of 50", async () => {
      await seedOn(
        Array.from(
          { length: 51 },
          (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
        ),
      );
      const page = await service.list(ORG, {});
      expect(page.items).toHaveLength(50);
      expect(page.nextCursor).not.toBeNull();
    });

    it("reports no next cursor when the page isn't full", async () => {
      await seedOn(["2026-09-20T12:00:00.000Z"]);
      expect((await service.list(ORG, { limit: 10 })).nextCursor).toBeNull();
    });

    it("reports no next cursor when the last page is exactly full", async () => {
      await seedOn(["2026-09-20T12:00:00.000Z", "2026-09-19T12:00:00.000Z"]);
      expect((await service.list(ORG, { limit: 2 })).nextCursor).toBeNull();
    });

    it("excludes other orgs", async () => {
      // Products are org-scoped too, so the other org needs its own.
      const theirProduct = products.seed("org_2", productInput({ name: "Sprite" }));
      await service.create(
        "org_2",
        draft({
          lines: [{ productId: theirProduct.id, units: 12, totalCostCents: 899 }],
        }),
      );
      expect((await service.list(ORG, {})).items).toHaveLength(0);
    });

    it("excludes removed purchases", async () => {
      const [id] = await seedOn(["2026-09-20T12:00:00.000Z"]);
      await service.remove(ORG, id as string);
      expect((await service.list(ORG, {})).items).toHaveLength(0);
    });

    // The case a naive purchasedAt-only cursor gets wrong: every row shares a
    // date, so the id tiebreaker is the only thing advancing the position.
    it("pages through rows that all share a purchasedAt without skips or duplicates", async () => {
      const ids = await seedOn(Array(5).fill("2026-09-20T12:00:00.000Z"));
      const seen = await pageThrough(2);
      expect(new Set(seen).size).toBe(5);
      expect(seen).toEqual([...ids].reverse());
    });

    it("pages correctly when a boundary falls inside a shared-date group", async () => {
      // 3 rows on the 20th, 2 on the 19th, read 2 at a time: the first page
      // ends mid-group, which is exactly where a missing tiebreaker shows up.
      const ids = await seedOn([
        "2026-09-19T12:00:00.000Z",
        "2026-09-19T12:00:00.000Z",
        "2026-09-20T12:00:00.000Z",
        "2026-09-20T12:00:00.000Z",
        "2026-09-20T12:00:00.000Z",
      ]);
      const seen = await pageThrough(2);
      expect(new Set(seen).size).toBe(5);
      expect(seen).toEqual([ids[4], ids[3], ids[2], ids[1], ids[0]]);
    });

    // The property offset pagination cannot give you.
    it("keeps paging stable when a row is inserted behind the reader", async () => {
      const ids = await seedOn([
        "2026-09-20T12:00:00.000Z",
        "2026-09-19T12:00:00.000Z",
        "2026-09-18T12:00:00.000Z",
      ]);
      const first = await service.list(ORG, { limit: 2 });
      const inserted = await service.create(
        ORG,
        draft({ purchasedAt: "2026-09-17T12:00:00.000Z" }),
      );
      const second = await service.list(ORG, {
        limit: 2,
        cursor: first.nextCursor,
      });
      expect(first.items.map((item) => item.id)).toEqual([ids[0], ids[1]]);
      expect(second.items.map((item) => item.id)).toEqual([ids[2], inserted.id]);
    });

    it("narrows to the given date window", async () => {
      await seedOn([
        "2026-09-18T12:00:00.000Z",
        "2026-09-20T12:00:00.000Z",
        "2026-09-25T12:00:00.000Z",
      ]);
      const page = await service.list(ORG, {
        from: "2026-09-19T00:00:00.000Z",
        to: "2026-09-21T00:00:00.000Z",
      });
      expect(page.items.map((item) => item.purchasedAt)).toEqual([
        "2026-09-20T12:00:00.000Z",
      ]);
    });

    it("includes rows exactly on the window edges", async () => {
      await seedOn(["2026-09-19T00:00:00.000Z", "2026-09-21T00:00:00.000Z"]);
      const page = await service.list(ORG, {
        from: "2026-09-19T00:00:00.000Z",
        to: "2026-09-21T00:00:00.000Z",
      });
      expect(page.items).toHaveLength(2);
    });

    it("rejects a cursor it did not mint", async () => {
      await expect(service.list(ORG, { cursor: "not-a-cursor" })).rejects.toThrow(
        /cursor/i,
      );
    });
  });
});

