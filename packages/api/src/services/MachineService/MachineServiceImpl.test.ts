import { beforeEach, describe, expect, it } from "bun:test";
import { ServiceError } from "../errors.ts";
import { MachineServiceImpl } from "./MachineServiceImpl.ts";
import {
  FakeLocationRepository,
  FakeMachineRepository,
  FakeMachineTemplateRepository,
  FakePlanogramRepository,
  locationInput,
  machineInput,
  machineTemplateInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("MachineService", () => {
  let locations: FakeLocationRepository;
  let machines: FakeMachineRepository;
  let planograms: FakePlanogramRepository;
  let templates: FakeMachineTemplateRepository;
  let service: MachineServiceImpl;
  let locationId: string;

  beforeEach(() => {
    locations = new FakeLocationRepository();
    machines = new FakeMachineRepository();
    planograms = new FakePlanogramRepository();
    templates = new FakeMachineTemplateRepository();
    service = new MachineServiceImpl(
      machines,
      locations,
      planograms,
      templates,
    );
    locationId = locations.seed(ORG, locationInput()).id;
  });

  it("rejects a machine referencing a location that doesn't exist", async () => {
    await expect(
      service.create(ORG, machineInput({ locationId: "ghost" })),
    ).rejects.toThrow(/location/i);
  });

  it("uppercases and trims slot codes, dropping empty shelves", async () => {
    const machine = await service.create(
      ORG,
      machineInput({ locationId, slots: [[" a1", "b2 "], []] }),
    );
    expect(machine.slots).toEqual([["A1", "B2"]]);
  });

  it("rejects duplicate slot codes, even across shelves", async () => {
    await expect(
      service.create(ORG, machineInput({ locationId, slots: [["A1"], ["a1"]] })),
    ).rejects.toThrow(/slot/i);
  });

  it("rejects a machine referencing a template that doesn't exist", async () => {
    await expect(
      service.create(ORG, machineInput({ locationId, templateId: "ghost" })),
    ).rejects.toThrow(/template/i);
  });

  it("records the template a machine was built from", async () => {
    const template = templates.seed(ORG, machineTemplateInput());
    const machine = await service.create(
      ORG,
      machineInput({ locationId, templateId: template.id }),
    );
    expect(machine.templateId).toBe(template.id);
  });

  // The template check is create-only on purpose: templates are soft-deletable
  // with no dependency check, and lineage is never dereferenced.
  it("still saves a machine whose template was deleted afterward", async () => {
    const template = templates.seed(ORG, machineTemplateInput());
    const machine = await service.create(
      ORG,
      machineInput({ locationId, templateId: template.id }),
    );
    await templates.softDelete(ORG, template.id);
    const updated = await service.update(
      ORG,
      machine.id,
      machineInput({ locationId, templateId: template.id, name: "Renamed" }),
    );
    expect(updated.name).toBe("Renamed");
    expect(updated.templateId).toBe(template.id);
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
