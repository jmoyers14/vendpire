import { beforeEach, describe, expect, it } from "bun:test";
import type { ProductData, ProductDataClient } from "@vendpire/platform";
import { ProductDataServiceImpl } from "./ProductDataServiceImpl.ts";

class FakeProductDataClient implements ProductDataClient {
  calls: string[] = [];
  async lookupByUpc(upc: string): Promise<ProductData | null> {
    this.calls.push(upc);
    return { name: "Cheetos Crunchy", brand: "Frito-Lay", imageUrl: "https://img" };
  }
}

describe("ProductDataService", () => {
  let client: FakeProductDataClient;
  let service: ProductDataServiceImpl;

  beforeEach(() => {
    client = new FakeProductDataClient();
    service = new ProductDataServiceImpl(client);
  });

  it("short-circuits blank or non-numeric barcodes without a provider call", async () => {
    expect(await service.lookup("  ")).toBeNull();
    expect(await service.lookup("not-a-upc")).toBeNull();
    expect(await service.lookup("123")).toBeNull(); // too short to be a GTIN
    expect(client.calls).toHaveLength(0);
  });

  it("strips whitespace and forwards plausible barcodes", async () => {
    const result = await service.lookup(" 028400090896 ");
    expect(result?.name).toBe("Cheetos Crunchy");
    expect(client.calls).toEqual(["028400090896"]);
  });
});
