import { beforeEach, describe, expect, it } from "bun:test";
import { ServiceError } from "../errors.ts";
import { MachineServiceImpl } from "./MachineServiceImpl.ts";
import {
  FakeLocationRepository,
  FakeMachineRepository,
  FakePlanogramRepository,
  locationInput,
  machineInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("MachineService", () => {
  let locations: FakeLocationRepository;
  let machines: FakeMachineRepository;
  let planograms: FakePlanogramRepository;
  let service: MachineServiceImpl;
  let locationId: string;

  beforeEach(() => {
    locations = new FakeLocationRepository();
    machines = new FakeMachineRepository();
    planograms = new FakePlanogramRepository();
    service = new MachineServiceImpl(machines, locations, planograms);
    locationId = locations.seed(ORG, locationInput()).id;
  });

  it("rejects a machine referencing a location that doesn't exist", async () => {
    await expect(
      service.create(ORG, machineInput({ locationId: "ghost" })),
    ).rejects.toThrow(/location/i);
  });

  it("uppercases, trims, and de-spaces slot codes", async () => {
    const machine = await service.create(
      ORG,
      machineInput({ locationId, slotCodes: [" a1", "b2 "] }),
    );
    expect(machine.slotCodes).toEqual(["A1", "B2"]);
  });

  it("rejects duplicate slot codes", async () => {
    await expect(
      service.create(ORG, machineInput({ locationId, slotCodes: ["A1", "a1"] })),
    ).rejects.toThrow(/slot/i);
  });

  it("keeps tagCode unique within the org", async () => {
    await service.create(ORG, machineInput({ locationId, tagCode: "VP-001" }));
    await expect(
      service.create(ORG, machineInput({ locationId, tagCode: "VP-001" })),
    ).rejects.toThrow(/tag/i);
  });

  it("lets an update keep its own tagCode", async () => {
    const machine = await service.create(
      ORG,
      machineInput({ locationId, tagCode: "VP-001" }),
    );
    const updated = await service.update(
      ORG,
      machine.id,
      machineInput({ locationId, tagCode: "VP-001", name: "Renamed" }),
    );
    expect(updated.name).toBe("Renamed");
  });

  it("blocks removing a machine that has planograms", async () => {
    const machine = await service.create(ORG, machineInput({ locationId }));
    planograms.seed(ORG, {
      machineId: machine.id,
      effectiveFrom: new Date().toISOString(),
      slots: [],
    });
    await expect(service.remove(ORG, machine.id)).rejects.toThrow(ServiceError);
  });
});
