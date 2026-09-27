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

  it("rejects a percent commission without percentBps", async () => {
    await expect(
      service.create(
        ORG,
        locationInput({
          commission: { type: "percent", percentBps: null, flatCents: null, basis: "gross" },
        }),
      ),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects a flat commission without flatCents", async () => {
    await expect(
      service.create(
        ORG,
        locationInput({
          commission: { type: "flat", percentBps: null, flatCents: null, basis: null },
        }),
      ),
    ).rejects.toThrow(ServiceError);
  });

  it("nulls commission amounts when type is none", async () => {
    const created = await service.create(
      ORG,
      locationInput({
        commission: { type: "none", percentBps: 1000, flatCents: 500, basis: "gross" },
      }),
    );
    expect(created.commission).toEqual({
      type: "none",
      percentBps: null,
      flatCents: null,
      basis: null,
    });
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
