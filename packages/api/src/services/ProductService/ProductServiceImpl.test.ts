import { beforeEach, describe, expect, it } from "bun:test";
import { ProductServiceImpl } from "./ProductServiceImpl.ts";
import {
  FakePlanogramRepository,
  FakeProductRepository,
  productInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("ProductService", () => {
  let products: FakeProductRepository;
  let planograms: FakePlanogramRepository;
  let service: ProductServiceImpl;

  beforeEach(() => {
    products = new FakeProductRepository();
    planograms = new FakePlanogramRepository();
    service = new ProductServiceImpl(products, planograms);
  });

  it("normalizes name/category and empty upc to null", async () => {
    const created = await service.create(
      ORG,
      productInput({ name: "  Doritos ", category: " chips ", upc: "  " }),
    );
    expect(created.name).toBe("Doritos");
    expect(created.category).toBe("chips");
    expect(created.upc).toBeNull();
  });

  it("blocks removing a product in a machine's CURRENT planogram", async () => {
    const product = products.seed(ORG, productInput());
    planograms.seed(ORG, {
      machineId: "m1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      slots: [{ slotCode: "A1", productId: product.id, par: 10, priceCents: 175 }],
    });
    await expect(service.remove(ORG, product.id)).rejects.toThrow(/planogram/i);
  });

  it("allows removing a product only present in an OLD planogram version", async () => {
    const product = products.seed(ORG, productInput());
    planograms.seed(ORG, {
      machineId: "m1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      slots: [{ slotCode: "A1", productId: product.id, par: 10, priceCents: 175 }],
    });
    planograms.seed(ORG, {
      machineId: "m1",
      effectiveFrom: "2026-02-01T00:00:00.000Z",
      slots: [{ slotCode: "A1", productId: "other", par: 10, priceCents: 175 }],
    });
    await service.remove(ORG, product.id);
    expect(await service.list(ORG)).toHaveLength(0);
  });
});
