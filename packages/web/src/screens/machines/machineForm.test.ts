import { describe, expect, test } from "bun:test";
import type { ApiMachineTemplate } from "../../apiTypes.ts";
import {
  buildMachineInput,
  EMPTY_MACHINE_DRAFT,
  fieldErrorsFor,
  type MachineDraft,
  orphanedSlotCodesFor,
  templateNamed,
  templatePrefillFor,
} from "./machineForm.ts";
import { buildRows } from "./slotGrid.ts";

const draft = (patch: Partial<MachineDraft> = {}): MachineDraft => ({
  ...EMPTY_MACHINE_DRAFT,
  locationId: "loc1",
  name: " Break room snack ",
  slots: { mode: "grid", rows: buildRows(2, 3), codesText: "" },
  ...patch,
});

const template = (patch: Partial<ApiMachineTemplate> = {}) =>
  ({
    id: "t1",
    name: "AMS 39",
    kind: "drink",
    make: "AMS",
    model: "39",
    slots: [["A1", "A2"]],
    ...patch,
  }) as ApiMachineTemplate;

describe("fieldErrorsFor", () => {
  test("a complete draft has no errors", () => {
    expect(fieldErrorsFor(draft())).toEqual({});
  });

  test("puts each problem under its own field", () => {
    expect(
      fieldErrorsFor(
        draft({
          locationId: "",
          name: " ",
          readerProvider: "nayax",
          readerDeviceId: " ",
          shouldSaveAsTemplate: true,
          newTemplateName: "",
        }),
      ),
    ).toEqual({
      locationId: "Pick a location",
      name: "Enter a name",
      readerDeviceId: "Enter the reader's device ID",
      newTemplateName: "Name the template you're saving",
    });
  });

  test("ignores the template name when not saving a template", () => {
    expect(fieldErrorsFor(draft({ newTemplateName: "" }))).toEqual({});
  });
});

describe("buildMachineInput", () => {
  test("trims text, turns blanks into nulls and expands the grid", () => {
    expect(
      buildMachineInput({ draft: draft({ make: " AMS ", serial: " " }), templateId: "t1" }),
    ).toEqual({
      locationId: "loc1",
      name: "Break room snack",
      kind: "snack",
      make: "AMS",
      model: null,
      serial: null,
      tagCode: null,
      templateId: "t1",
      slots: [
        ["A1", "A2", "A3"],
        ["B1", "B2", "B3"],
      ],
      cardReader: null,
      active: true,
    });
  });

  test("a card reader carries its trimmed device ID", () => {
    const input = buildMachineInput({
      draft: draft({ readerProvider: "cantaloupe", readerDeviceId: " VK123 " }),
      templateId: null,
    });
    expect(input.cardReader).toEqual({ provider: "cantaloupe", deviceId: "VK123" });
  });
});

describe("templatePrefillFor", () => {
  test("takes the template's kind and layout", () => {
    const prefill = templatePrefillFor({ draft: draft(), template: template() });
    expect(prefill.templateId).toBe("t1");
    expect(prefill.kind).toBe("drink");
    expect(prefill.slots?.rows).toEqual([{ letter: "A", columns: 2, start: 1, step: 1 }]);
  });

  test("keeps a make you typed and fills a blank model", () => {
    const prefill = templatePrefillFor({ draft: draft({ make: "Crane" }), template: template() });
    expect(prefill.make).toBe("Crane");
    expect(prefill.model).toBe("39");
  });

  test("touches no field that can carry an error", () => {
    const prefill = templatePrefillFor({ draft: draft(), template: template() });
    expect(Object.keys(prefill)).not.toContain("name");
    expect(Object.keys(prefill)).not.toContain("locationId");
  });
});

describe("templateNamed", () => {
  test("matches a saved template by trimmed name in any case", () => {
    expect(templateNamed({ name: " ams 39 ", templates: [template()] })?.id).toBe("t1");
  });

  test("finds nothing for a different name", () => {
    expect(templateNamed({ name: "AMS 40", templates: [template()] })).toBeUndefined();
  });
});

test("orphanedSlotCodesFor lists planned slots the layout no longer has", () => {
  expect(
    orphanedSlotCodesFor({ shelves: [["A1", "A2"]], plannedSlotCodes: ["A1", "A3", "B1"] }),
  ).toEqual(["A3", "B1"]);
});
