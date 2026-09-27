import { beforeEach, describe, expect, it } from "bun:test";
import type {
  ProductData,
  ProductDataClient,
  ProductSearchResult,
} from "@vendpire/platform";
import { ProductDataServiceImpl } from "./ProductDataServiceImpl.ts";

class FakeProductDataClient implements ProductDataClient {
  calls: string[] = [];
  async lookupByUpc(upc: string): Promise<ProductData | null> {
    this.calls.push(upc);
    return { name: "Cheetos Crunchy", brand: "Frito-Lay", imageUrl: "https://img" };
  }

  searchCalls: string[] = [];
  async searchByName(query: string): Promise<ProductSearchResult[]> {
    this.searchCalls.push(query);
    return [
      { upc: "028400040037", name: "Fritos, The Original", brand: "Fritos", imageUrl: null },
    ];
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

  it("short-circuits text queries under 3 characters", async () => {
    expect(await service.search(" fr ")).toEqual([]);
    expect(client.searchCalls).toHaveLength(0);
  });

  it("trims and forwards real text queries", async () => {
    const results = await service.search("  fritos  ");
    expect(results[0]?.upc).toBe("028400040037");
    expect(client.searchCalls).toEqual(["fritos"]);
  });
});
