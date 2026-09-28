import { beforeEach, describe, expect, it } from "bun:test";
import { ServiceError } from "../errors.ts";
import { PackServiceImpl } from "./PackServiceImpl.ts";
import {
  FakePackRepository,
  FakeProductRepository,
  productInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("PackService", () => {
  let packs: FakePackRepository;
  let products: FakeProductRepository;
  let service: PackServiceImpl;
  let cokeId: string;
  let fritosId: string;

  beforeEach(() => {
    packs = new FakePackRepository();
    products = new FakeProductRepository();
    service = new PackServiceImpl(packs, products);
    cokeId = products.seed(ORG, productInput({ name: "Coke 12oz" })).id;
    fritosId = products.seed(ORG, productInput({ name: "Fritos 1oz" })).id;
  });

  const input = (over: Record<string, unknown> = {}) => ({
    name: "Coke 35pk",
    barcodes: ["049000058499"],
    contents: [{ productId: cokeId, units: 35 }],
    active: true,
    ...over,
  });

  it("normalizes barcodes to GTIN-14 on create", async () => {
    const pack = await service.create(ORG, input());
    expect(pack.barcodes).toEqual(["00049000058499"]);
  });

  it("rejects invalid barcodes", async () => {
    await expect(
      service.create(ORG, input({ barcodes: ["12345"] })),
    ).rejects.toThrow(/barcode/i);
  });

  it("supports variety packs with multiple contents", async () => {
    const pack = await service.create(
      ORG,
      input({
        name: "Variety 30ct",
        barcodes: [],
        contents: [
          { productId: cokeId, units: 10 },
          { productId: fritosId, units: 20 },
        ],
      }),
    );
    expect(pack.contents).toHaveLength(2);
  });

  it("rejects contents referencing unknown products", async () => {
    await expect(
      service.create(ORG, input({ contents: [{ productId: "ghost", units: 5 }] })),
    ).rejects.toThrow(/product/i);
  });

  it("rejects duplicate products within one pack", async () => {
    await expect(
      service.create(
        ORG,
        input({
          contents: [
            { productId: cokeId, units: 10 },
            { productId: cokeId, units: 5 },
          ],
        }),
      ),
    ).rejects.toThrow(/duplicate/i);
  });

  it("rejects a barcode already on another pack", async () => {
    await service.create(ORG, input());
    await expect(
      service.create(ORG, input({ name: "Other pack" })),
    ).rejects.toThrow(ServiceError);
  });

  it("lets an update keep its own barcode", async () => {
    const pack = await service.create(ORG, input());
    const updated = await service.update(ORG, pack.id, input({ name: "Renamed" }));
    expect(updated.name).toBe("Renamed");
  });

  it("rejects a barcode that is already a product's unit upc", async () => {
    products.seed(ORG, productInput({ name: "Solo can", upc: "00049000006346" }));
    await expect(
      service.create(ORG, input({ barcodes: ["049000006346"] })),
    ).rejects.toThrow(/unit/i);
  });
});
