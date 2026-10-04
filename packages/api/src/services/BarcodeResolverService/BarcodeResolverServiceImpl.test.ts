import { beforeEach, describe, expect, it } from "bun:test";
import type { ProductData } from "@vendpire/platform";
import { BarcodeResolverServiceImpl } from "./BarcodeResolverServiceImpl.ts";
import type { ProductDataService } from "../ProductDataService/ProductDataService.ts";
import {
  FakePackRepository,
  FakeProductRepository,
  productInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";
// Coca-Cola 12oz: UPC-A, its zero-padded EAN-13, and the UPC-E that expands
// to the same code — all must resolve identically.
const UPC_A = "049000006346";
const EAN_13 = "0049000006346";
const UPC_E = "04963406";
const GTIN_14 = "00049000006346";
// The case code for the same product: indicator digit 1, so likelyCase.
const CASE_GTIN_14 = "10049000006343";

class FakeCatalog implements ProductDataService {
  result: ProductData | null = null;
  shouldThrow = false;
  calls: string[] = [];
  async lookup(upc: string): Promise<ProductData | null> {
    this.calls.push(upc);
    if (this.shouldThrow) {
      throw new Error("provider down");
    }
    return this.result;
  }
  async search() {
    return [];
  }
}

describe("BarcodeResolverService", () => {
  let products: FakeProductRepository;
  let packs: FakePackRepository;
  let catalog: FakeCatalog;
  let service: BarcodeResolverServiceImpl;

  beforeEach(() => {
    products = new FakeProductRepository();
    packs = new FakePackRepository();
    catalog = new FakeCatalog();
    service = new BarcodeResolverServiceImpl(products, packs, catalog);
  });

  it("rejects codes that aren't valid GTINs", async () => {
    const result = await service.resolve(ORG, "12345");
    expect(result.status).toBe("invalid");
    expect(catalog.calls).toHaveLength(0);
  });

  it("resolves a known product, whatever spelling was scanned", async () => {
    products.seed(ORG, productInput({ name: "Coke 12oz", upc: GTIN_14 }));
    for (const spelling of [UPC_A, EAN_13, UPC_E]) {
      const result = await service.resolve(ORG, spelling);
      expect(result).toMatchObject({ status: "product", gtin14: GTIN_14 });
    }
    // Known codes never reach an outside service.
    expect(catalog.calls).toHaveLength(0);
  });

  it("resolves a known pack", async () => {
    packs.seed(ORG, {
      name: "Coke 35pk",
      barcodes: [GTIN_14],
      contents: [{ productId: "p1", units: 35 }],
      active: true,
    });
    const result = await service.resolve(ORG, UPC_A);
    expect(result).toMatchObject({ status: "pack", gtin14: GTIN_14 });
  });

  it("prefers our own product over the outside catalog", async () => {
    products.seed(ORG, productInput({ name: "Mine", upc: GTIN_14 }));
    catalog.result = { name: "Theirs", brand: null, imageUrl: null };
    const result = await service.resolve(ORG, UPC_A);
    expect(result.status).toBe("product");
  });

  it("returns a catalog candidate when we don't know the code", async () => {
    catalog.result = { name: "Coca-Cola", brand: "Coke", imageUrl: "https://i" };
    const result = await service.resolve(ORG, UPC_A);
    expect(result).toMatchObject({ status: "candidate", gtin14: GTIN_14 });
    expect(catalog.calls).toEqual([GTIN_14]);
  });

  it("returns unknown when nobody knows the code", async () => {
    const result = await service.resolve(ORG, UPC_A);
    expect(result).toMatchObject({ status: "unknown", gtin14: GTIN_14 });
  });

  it("treats a provider outage as unknown rather than failing entry", async () => {
    catalog.shouldThrow = true;
    const result = await service.resolve(ORG, UPC_A);
    expect(result.status).toBe("unknown");
  });

  it("reports likelyCase on unknown codes so the setup UI can preselect", async () => {
    expect(await service.resolve(ORG, CASE_GTIN_14)).toMatchObject({
      status: "unknown",
      likelyCase: true,
    });
    expect(await service.resolve(ORG, UPC_A)).toMatchObject({
      status: "unknown",
      likelyCase: false,
    });
  });

  it("reports likelyCase on catalog candidates too", async () => {
    catalog.result = { name: "Coca-Cola", brand: null, imageUrl: null };
    expect(await service.resolve(ORG, CASE_GTIN_14)).toMatchObject({
      status: "candidate",
      likelyCase: true,
    });
  });
});
