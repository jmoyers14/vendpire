import { describe, expect, test } from "bun:test";
import type { ApiMachineTemplate } from "../../apiTypes.ts";
import { buildRows } from "./slotGrid.ts";
import {
  buildTemplateInput,
  draftFor,
  EMPTY_TEMPLATE_DRAFT,
  fieldErrorsFor,
  makeModelFor,
  type TemplateDraft,
} from "./templateForm.ts";

const draft = (patch: Partial<TemplateDraft> = {}): TemplateDraft => ({
  ...EMPTY_TEMPLATE_DRAFT,
  name: " AMS 39 ",
  slots: { mode: "grid", rows: buildRows(1, 2), codesText: "" },
  ...patch,
});

describe("fieldErrorsFor", () => {
  test("a complete draft has no errors", () => {
    expect(fieldErrorsFor(draft())).toEqual({});
  });

  test("a blank name and no slots each get an error", () => {
    expect(
      fieldErrorsFor(draft({ name: " ", slots: { mode: "custom", rows: [], codesText: "\n" } })),
    ).toEqual({ name: "Enter a name", slots: "A template needs at least one slot" });
  });
});

test("buildTemplateInput trims text, nulls blanks and expands the grid", () => {
  expect(buildTemplateInput(draft({ make: " AMS ", model: "" }))).toEqual({
    name: "AMS 39",
    kind: "snack",
    make: "AMS",
    model: null,
    slots: [["A1", "A2"]],
  });
});

test("draftFor reopens a saved template, layout included", () => {
  const template = {
    id: "t1",
    name: "Evens",
    kind: "drink",
    make: null,
    model: "39",
    slots: [["A0", "A2"]],
  } as ApiMachineTemplate;
  const reopened = draftFor(template);
  expect(reopened).toMatchObject({ name: "Evens", kind: "drink", make: "", model: "39" });
  expect(reopened.slots.rows).toEqual([{ letter: "A", columns: 2, start: 0, step: 2 }]);
});

describe("makeModelFor", () => {
  test("joins what's set", () => {
    expect(makeModelFor({ make: "AMS", model: "39" })).toBe("AMS 39");
    expect(makeModelFor({ make: null, model: "39" })).toBe("39");
  });

  test("is null when neither is set", () => {
    expect(makeModelFor({ make: null, model: null })).toBeNull();
  });
});
