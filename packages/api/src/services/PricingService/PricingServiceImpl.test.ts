import { beforeEach, describe, expect, it } from "bun:test";
import { PricingServiceImpl } from "./PricingServiceImpl.ts";
import { FakeProductRepository, FakePurchaseRepository, productInput } from "../test-support/fakes.ts";

const ORG = "org_1";

describe("PricingService", () => {
  let purchases: FakePurchaseRepository;
  let products: FakeProductRepository;
  let service: PricingServiceImpl;
  let cokeId: string;
  let gumId: string;

  beforeEach(() => {
    purchases = new FakePurchaseRepository();
    products = new FakeProductRepository();
    service = new PricingServiceImpl(purchases);
    cokeId = products.seed(ORG, productInput({ name: "Coke 12oz" })).id;
    gumId = products.seed(ORG, productInput({ name: "Gum 15ct" })).id;
  });

  let keySeq = 0;
  const seedPurchase = (
    purchasedAt: string,
    vendor: string,
    lines: { productId: string; units: number; totalCostCents: number }[],
  ) =>
    purchases.seed(ORG, {
      purchasedAt,
      vendor,
      lines: lines.map((line) => ({ ...line, packId: null })),
      receiptTotalCents: null,
      notes: null,
      clientRequestId: `req_${(keySeq += 1)}`,
    });

  it("prices off the latest purchase, not the average of the history", async () => {
    seedPurchase("2026-08-01T00:00:00.000Z", "Sam's", [
      { productId: cokeId, units: 36, totalCostCents: 1199 },
    ]);
    seedPurchase("2026-10-24T00:00:00.000Z", "Costco", [
      { productId: cokeId, units: 36, totalCostCents: 1439 },
    ]);

    const [pricing] = await service.list(ORG);

    expect(pricing).toEqual({
      productId: cokeId,
      units: 36,
      totalCostCents: 1439,
      purchasedAt: "2026-10-24T00:00:00.000Z",
      vendor: "Costco",
      // 1439/36 = 39.97c; x2.25 = 90c, up to the next quarter.
      suggestedPriceCents: 100,
    });
  });

  it("omits a product that has never been purchased", async () => {
    seedPurchase("2026-10-24T00:00:00.000Z", "Costco", [
      { productId: cokeId, units: 36, totalCostCents: 1439 },
    ]);

    const rows = await service.list(ORG);

    expect(rows.map((row) => row.productId)).toEqual([cokeId]);
    expect(rows.some((row) => row.productId === gumId)).toBe(false);
  });

  it("keeps a free product, which simply has no price to suggest", async () => {
    seedPurchase("2026-10-24T00:00:00.000Z", "Rep sample", [
      { productId: gumId, units: 12, totalCostCents: 0 },
    ]);

    const [pricing] = await service.list(ORG);

    expect(pricing?.totalCostCents).toBe(0);
    expect(pricing?.suggestedPriceCents).toBeNull();
  });

  it("never reaches across the org boundary", async () => {
    seedPurchase("2026-10-24T00:00:00.000Z", "Costco", [
      { productId: cokeId, units: 36, totalCostCents: 1439 },
    ]);

    expect(await service.list("org_2")).toEqual([]);
  });
});
