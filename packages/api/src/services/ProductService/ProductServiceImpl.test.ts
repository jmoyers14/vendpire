import { beforeEach, describe, expect, it } from "bun:test";
import { ProductServiceImpl } from "./ProductServiceImpl.ts";
import {
  FakePackRepository,
  FakePlanogramRepository,
  FakeProductRepository,
  productInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("ProductService", () => {
  let products: FakeProductRepository;
  let planograms: FakePlanogramRepository;
  let packs: FakePackRepository;
  let service: ProductServiceImpl;

  beforeEach(() => {
    products = new FakeProductRepository();
    planograms = new FakePlanogramRepository();
    packs = new FakePackRepository();
    service = new ProductServiceImpl(products, planograms, packs);
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

  it("normalizes the unit upc to GTIN-14", async () => {
    const created = await service.create(
      ORG,
      productInput({ upc: "049000006346" }),
    );
    expect(created.upc).toBe("00049000006346");
  });

  it("rejects an invalid unit upc", async () => {
    await expect(
      service.create(ORG, productInput({ upc: "12345" })),
    ).rejects.toThrow(/barcode|upc/i);
  });

  it("rejects a upc already used by another product", async () => {
    await service.create(ORG, productInput({ upc: "049000006346" }));
    await expect(
      service.create(ORG, productInput({ name: "Copy", upc: "0049000006346" })),
    ).rejects.toThrow(/already/i);
  });

  it("rejects a upc that is a pack barcode", async () => {
    packs.seed(ORG, {
      name: "Coke case",
      barcodes: ["00049000058499"],
      contents: [{ productId: "p", units: 35 }],
      active: true,
    });
    await expect(
      service.create(ORG, productInput({ upc: "049000058499" })),
    ).rejects.toThrow(/pack/i);
  });

  it("blocks removing a product that is inside an active pack", async () => {
    const product = products.seed(ORG, productInput());
    packs.seed(ORG, {
      name: "Variety",
      barcodes: [],
      contents: [{ productId: product.id, units: 10 }],
      active: true,
    });
    await expect(service.remove(ORG, product.id)).rejects.toThrow(/pack/i);
  });
});
