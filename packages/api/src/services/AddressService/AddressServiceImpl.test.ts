import { beforeEach, describe, expect, it } from "bun:test";
import type {
  AddressSuggestion,
  MapsClient,
  ResolvedAddress,
} from "@vendpire/platform";
import { AddressServiceImpl } from "./AddressServiceImpl.ts";

class FakeMapsClient implements MapsClient {
  autocompleteCalls: string[] = [];
  resolveCalls: string[] = [];

  async autocompleteAddress(input: string): Promise<AddressSuggestion[]> {
    this.autocompleteCalls.push(input);
    return [{ placeId: "p1", description: `${input}, San Diego, CA` }];
  }

  async resolveAddress(placeId: string): Promise<ResolvedAddress | null> {
    this.resolveCalls.push(placeId);
    return {
      formattedAddress: "123 Main St, San Diego, CA 92101, USA",
      line1: "123 Main St",
      city: "San Diego",
      state: "CA",
      zip: "92101",
      latitude: 32.7,
      longitude: -117.1,
    };
  }
}

describe("AddressService", () => {
  let maps: FakeMapsClient;
  let service: AddressServiceImpl;

  beforeEach(() => {
    maps = new FakeMapsClient();
    service = new AddressServiceImpl(maps);
  });

  it("short-circuits queries under 3 characters without a provider call", async () => {
    expect(await service.suggest("12")).toEqual([]);
    expect(await service.suggest("  a  ")).toEqual([]);
    expect(maps.autocompleteCalls).toHaveLength(0);
  });

  it("trims and forwards real queries", async () => {
    const results = await service.suggest("  123 Main  ");
    expect(results).toHaveLength(1);
    expect(maps.autocompleteCalls).toEqual(["123 Main"]);
  });

  it("short-circuits blank place ids without a provider call", async () => {
    expect(await service.resolve("  ")).toBeNull();
    expect(maps.resolveCalls).toHaveLength(0);
  });

  it("resolves a place id into a structured address", async () => {
    const resolved = await service.resolve("p1");
    expect(resolved?.city).toBe("San Diego");
    expect(resolved?.zip).toBe("92101");
  });
});
