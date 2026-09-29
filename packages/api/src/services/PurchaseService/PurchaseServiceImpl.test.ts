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
});
