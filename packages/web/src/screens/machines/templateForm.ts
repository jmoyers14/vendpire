import type { ApiMachineTemplate } from "../../apiTypes.ts";
import { nullIfBlank } from "../../utils/text.ts";
import type { MachineKind } from "./machineKind.ts";
import {
  emptySlotsValue,
  type SlotsValue,
  shelvesToSlotsValue,
  slotsValueToShelves,
} from "./slotGrid.ts";

/**
 * The template form's draft and how it becomes what the API takes. Pure, so
 * the rules are tested without a browser.
 */

/** Strings because they back inputs; trimmed only on save. */
export interface TemplateDraft {
  name: string;
  kind: MachineKind;
  make: string;
  model: string;
  slots: SlotsValue;
}

export const EMPTY_TEMPLATE_DRAFT: TemplateDraft = {
  name: "",
  kind: "snack",
  make: "",
  model: "",
  slots: emptySlotsValue(),
};

/** A saved template, reopened for editing. */
export const draftFor = (template: ApiMachineTemplate): TemplateDraft => ({
  name: template.name,
  kind: template.kind,
  make: template.make ?? "",
  model: template.model ?? "",
  slots: shelvesToSlotsValue(template.slots),
});

export type TemplateFieldErrors = Partial<Record<"name" | "slots", string>>;

/** Every field that's wrong, each under its own key. Empty when the draft can save. */
export const fieldErrorsFor = (draft: TemplateDraft): TemplateFieldErrors => ({
  ...(draft.name.trim() ? {} : { name: "Enter a name" }),
  ...(slotsValueToShelves(draft.slots).flat().length > 0
    ? {}
    : { slots: "A template needs at least one slot" }),
});

/** The draft as the API takes it. Check `fieldErrorsFor` first. */
export const buildTemplateInput = (draft: TemplateDraft) => ({
  name: draft.name.trim(),
  kind: draft.kind,
  make: nullIfBlank(draft.make),
  model: nullIfBlank(draft.model),
  slots: slotsValueToShelves(draft.slots),
});

/** "AMS 39", "AMS", or null when neither is set. */
export const makeModelFor = (template: Pick<ApiMachineTemplate, "make" | "model">) =>
  [template.make, template.model].filter(Boolean).join(" ") || null;
