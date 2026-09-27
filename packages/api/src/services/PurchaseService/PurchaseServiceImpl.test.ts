import { beforeEach, describe, expect, it } from "bun:test";
import { PurchaseServiceImpl } from "./PurchaseServiceImpl.ts";
import {
  FakeProductRepository,
  FakePurchaseRepository,
  productInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("PurchaseService", () => {
  let purchases: FakePurchaseRepository;
  let products: FakeProductRepository;
  let service: PurchaseServiceImpl;
  let productId: string;

  beforeEach(() => {
    purchases = new FakePurchaseRepository();
    products = new FakeProductRepository();
    service = new PurchaseServiceImpl(purchases, products);
    productId = products.seed(ORG, productInput()).id;
  });

  it("creates a purchase with valid lines", async () => {
    const created = await service.create(ORG, {
      purchasedAt: "2026-09-20T00:00:00.000Z",
      vendor: " Costco ",
      lines: [{ productId, units: 30, totalCostCents: 1499 }],
      notes: null,
    });
    expect(created.vendor).toBe("Costco");
    expect(created.lines[0]?.totalCostCents).toBe(1499);
  });

  it("rejects lines referencing unknown products", async () => {
    await expect(
      service.create(ORG, {
        purchasedAt: "2026-09-20T00:00:00.000Z",
        vendor: "Costco",
        lines: [{ productId: "ghost", units: 30, totalCostCents: 1499 }],
        notes: null,
      }),
    ).rejects.toThrow(/product/i);
  });

  it("rejects an empty line list", async () => {
    await expect(
      service.create(ORG, {
        purchasedAt: "2026-09-20T00:00:00.000Z",
        vendor: "Costco",
        lines: [],
        notes: null,
      }),
    ).rejects.toThrow(/line/i);
  });
});
