import { beforeEach, describe, expect, it } from "bun:test";
import { MachineTemplateServiceImpl } from "./MachineTemplateServiceImpl.ts";
import {
  FakeMachineTemplateRepository,
  machineTemplateInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("MachineTemplateService", () => {
  let templates: FakeMachineTemplateRepository;
  let service: MachineTemplateServiceImpl;

  beforeEach(() => {
    templates = new FakeMachineTemplateRepository();
    service = new MachineTemplateServiceImpl(templates);
  });

  it("trims the name and requires one", async () => {
    const template = await service.create(
      ORG,
      machineTemplateInput({ name: "  AMS 39  " }),
    );
    expect(template.name).toBe("AMS 39");
    await expect(
      service.create(ORG, machineTemplateInput({ name: "   " })),
    ).rejects.toThrow(/name/i);
  });

  it("rejects a duplicate name, ignoring case", async () => {
    await service.create(ORG, machineTemplateInput({ name: "AMS 39" }));
    await expect(
      service.create(ORG, machineTemplateInput({ name: "ams 39" })),
    ).rejects.toThrow(/already exists/i);
  });

  it("scopes the name check to the org", async () => {
    await service.create(ORG, machineTemplateInput({ name: "AMS 39" }));
    const other = await service.create(
      "org_2",
      machineTemplateInput({ name: "AMS 39" }),
    );
    expect(other.name).toBe("AMS 39");
  });

  it("frees up a name once the template is removed", async () => {
    const first = await service.create(ORG, machineTemplateInput({ name: "AMS 39" }));
    await service.remove(ORG, first.id);
    const second = await service.create(
      ORG,
      machineTemplateInput({ name: "AMS 39" }),
    );
    expect(second.id).not.toBe(first.id);
  });

  it("lets an update keep its own name", async () => {
    const template = await service.create(
      ORG,
      machineTemplateInput({ name: "AMS 39" }),
    );
    const updated = await service.update(
      ORG,
      template.id,
      machineTemplateInput({ name: "AMS 39", make: "AMS" }),
    );
    expect(updated.make).toBe("AMS");
  });

  it("uppercases and trims slot codes, dropping empty shelves", async () => {
    const template = await service.create(
      ORG,
      machineTemplateInput({ slots: [[" a1", "b2 "], []] }),
    );
    expect(template.slots).toEqual([["A1", "B2"]]);
  });

  it("rejects duplicate slot codes, even across shelves", async () => {
    await expect(
      service.create(ORG, machineTemplateInput({ slots: [["A1"], ["a1"]] })),
    ).rejects.toThrow(/duplicate slot/i);
  });

  it("rejects a template with no slots", async () => {
    await expect(
      service.create(ORG, machineTemplateInput({ slots: [[]] })),
    ).rejects.toThrow(/at least one slot/i);
  });

  it("nulls out blank make and model", async () => {
    const template = await service.create(
      ORG,
      machineTemplateInput({ make: "  ", model: " AMS " }),
    );
    expect(template.make).toBeNull();
    expect(template.model).toBe("AMS");
  });

  it("reports a missing template on update", async () => {
    await expect(
      service.update(ORG, "ghost", machineTemplateInput()),
    ).rejects.toThrow(/not found/i);
  });

  it("hides a removed template from the list", async () => {
    const template = await service.create(ORG, machineTemplateInput());
    await service.remove(ORG, template.id);
    expect(await service.list(ORG)).toEqual([]);
    expect(await service.get(ORG, template.id)).toBeNull();
  });
});
