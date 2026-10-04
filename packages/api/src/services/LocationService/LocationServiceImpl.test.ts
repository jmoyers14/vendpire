import { beforeEach, describe, expect, it } from "bun:test";
import { ServiceError } from "../errors.ts";
import { LocationServiceImpl } from "./LocationServiceImpl.ts";
import {
  FakeLocationRepository,
  FakeMachineRepository,
  locationInput,
  machineInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("LocationService", () => {
  let locations: FakeLocationRepository;
  let machines: FakeMachineRepository;
  let service: LocationServiceImpl;

  beforeEach(() => {
    locations = new FakeLocationRepository();
    machines = new FakeMachineRepository();
    service = new LocationServiceImpl(locations, machines);
  });

  it("trims strings and lowercases the contact email on create", async () => {
    const created = await service.create(
      ORG,
      locationInput({
        name: "  Gym  ",
        contact: { name: " Pat ", phone: null, email: " PAT@GYM.COM " },
      }),
    );
    expect(created.name).toBe("Gym");
    expect(created.contact.name).toBe("Pat");
    expect(created.contact.email).toBe("pat@gym.com");
  });

  // The two cases this file used to cover — a percent commission with no basis
  // points, a flat one with no cents — are no longer expressible: the
  // LocationCommission union has no arm for them, so they fail to compile
  // rather than failing at runtime. What's left worth asserting is that each
  // arm round-trips with its own payload and nothing else.
  it("stores a percent commission with its rate and basis", async () => {
    const created = await service.create(
      ORG,
      locationInput({
        commission: { type: "percent", percentBps: 1500, basis: "net" },
      }),
    );
    expect(created.commission).toEqual({
      type: "percent",
      percentBps: 1500,
      basis: "net",
    });
  });

  it("stores a flat commission with its amount", async () => {
    const created = await service.create(
      ORG,
      locationInput({ commission: { type: "flat", flatCents: 5000 } }),
    );
    expect(created.commission).toEqual({ type: "flat", flatCents: 5000 });
  });

  it("carries no payload when there is no commission", async () => {
    const created = await service.create(
      ORG,
      locationInput({ commission: { type: "none" } }),
    );
    expect(created.commission).toEqual({ type: "none" });
  });

  it("blocks removing a location that still has machines", async () => {
    const location = locations.seed(ORG, locationInput());
    machines.seed(ORG, machineInput({ locationId: location.id }));
    await expect(service.remove(ORG, location.id)).rejects.toThrow(
      /machine/i,
    );
  });

  it("removes an empty location", async () => {
    const location = locations.seed(ORG, locationInput());
    await service.remove(ORG, location.id);
    expect(await service.list(ORG)).toHaveLength(0);
  });

  it("throws NOT_FOUND when updating a missing location", async () => {
    await expect(
      service.update(ORG, "nope", locationInput()),
    ).rejects.toThrow(ServiceError);
  });
});
