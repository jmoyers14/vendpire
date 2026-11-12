import type { ApiMachine, ApiMachineTemplate } from "../../apiTypes.ts";
import { nullIfBlank, plural } from "../../utils/text.ts";
import { MACHINE_KIND_LABELS, type MachineKind } from "./machineKind.ts";
import {
  emptySlotsValue,
  type SlotsValue,
  shelvesToSlotsValue,
  slotsValueToShelves,
} from "./slotGrid.ts";

/**
 * The machine form's draft and how it becomes what the API takes. Pure, so
 * the rules are tested without a browser.
 */

export type ReaderProvider = NonNullable<ApiMachine["cardReader"]>["provider"];

export const READER_PROVIDER_LABELS: Record<ReaderProvider, string> = {
  cantaloupe: "Cantaloupe",
  nayax: "Nayax",
};

/** Strings because they back inputs; trimmed only on save. */
export interface MachineDraft {
  locationId: string;
  name: string;
  kind: MachineKind;
  make: string;
  model: string;
  serial: string;
  tagCode: string;
  /** Layout lineage. Carried through edits so saving doesn't erase it. */
  templateId: string | null;
  slots: SlotsValue;
  shouldSaveAsTemplate: boolean;
  newTemplateName: string;
  /** "" is no card reader. */
  readerProvider: ReaderProvider | "";
  readerDeviceId: string;
  isActive: boolean;
}

export const EMPTY_MACHINE_DRAFT: MachineDraft = {
  locationId: "",
  name: "",
  kind: "snack",
  make: "",
  model: "",
  serial: "",
  tagCode: "",
  templateId: null,
  slots: emptySlotsValue(),
  shouldSaveAsTemplate: false,
  newTemplateName: "",
  readerProvider: "",
  readerDeviceId: "",
  isActive: true,
};

/** A saved machine, reopened for editing. */
export const draftFor = (machine: ApiMachine): MachineDraft => ({
  ...EMPTY_MACHINE_DRAFT,
  locationId: machine.locationId,
  name: machine.name,
  kind: machine.kind,
  make: machine.make ?? "",
  model: machine.model ?? "",
  serial: machine.serial ?? "",
  tagCode: machine.tagCode ?? "",
  templateId: machine.templateId,
  slots: shelvesToSlotsValue(machine.slots),
  readerProvider: machine.cardReader?.provider ?? "",
  readerDeviceId: machine.cardReader?.deviceId ?? "",
  isActive: machine.active,
});

/**
 * What a picked template fills in. Make and model fill only when blank; kind
 * always applies, since the select has no empty state to test for.
 */
export const templatePrefillFor = ({
  draft,
  template,
}: {
  draft: MachineDraft;
  template: ApiMachineTemplate;
}): Partial<MachineDraft> => ({
  templateId: template.id,
  kind: template.kind,
  make: draft.make.trim() ? draft.make : (template.make ?? ""),
  model: draft.model.trim() ? draft.model : (template.model ?? ""),
  slots: shelvesToSlotsValue(template.slots),
});

export type MachineFieldErrors = Partial<
  Record<"locationId" | "name" | "readerDeviceId" | "newTemplateName", string>
>;

/**
 * Errors that belong to another field's choice: turning the reader or the
 * template off makes its follow-up field's error moot.
 */
export const DEPENDENT_ERROR_KEYS: Partial<Record<keyof MachineDraft, keyof MachineFieldErrors>> = {
  readerProvider: "readerDeviceId",
  shouldSaveAsTemplate: "newTemplateName",
};

/** Every field that's wrong, each under its own key. Empty when the draft can save. */
export const fieldErrorsFor = (draft: MachineDraft): MachineFieldErrors => ({
  ...(draft.locationId ? {} : { locationId: "Pick a location" }),
  ...(draft.name.trim() ? {} : { name: "Enter a name" }),
  ...(draft.readerProvider && !draft.readerDeviceId.trim()
    ? { readerDeviceId: "Enter the reader's device ID" }
    : {}),
  ...(draft.shouldSaveAsTemplate && !draft.newTemplateName.trim()
    ? { newTemplateName: "Name the template you're saving" }
    : {}),
});

/**
 * A template of the same name, any case. Saving the layout again reuses it,
 * so a retry after a failed machine save doesn't trip the name clash.
 */
export const templateNamed = ({
  name,
  templates,
}: {
  name: string;
  templates: ApiMachineTemplate[];
}): ApiMachineTemplate | undefined => {
  const wanted = name.trim().toLowerCase();
  return templates.find((template) => template.name.toLowerCase() === wanted);
};

/** The draft as the API takes it. Check `fieldErrorsFor` first. */
export const buildMachineInput = ({
  draft,
  templateId,
}: {
  draft: MachineDraft;
  templateId: string | null;
}) => ({
  locationId: draft.locationId,
  name: draft.name.trim(),
  kind: draft.kind,
  make: nullIfBlank(draft.make),
  model: nullIfBlank(draft.model),
  serial: nullIfBlank(draft.serial),
  tagCode: nullIfBlank(draft.tagCode),
  templateId,
  slots: slotsValueToShelves(draft.slots),
  cardReader: draft.readerProvider
    ? { provider: draft.readerProvider, deviceId: draft.readerDeviceId.trim() }
    : null,
  active: draft.isActive,
});

/**
 * Slot codes the live planogram fills that a layout no longer has. Saving
 * still goes through; those assignments just stop showing on the face.
 */
export const orphanedSlotCodesFor = ({
  shelves,
  plannedSlotCodes,
}: {
  shelves: string[][];
  plannedSlotCodes: string[];
}): string[] => {
  const codes = new Set(shelves.flat());
  return plannedSlotCodes.filter((code) => !codes.has(code));
};

/** "Westside Laundromat · Snack · 48 slots" for a list row. */
export const machineSummaryFor = ({
  machine,
  locationName,
}: {
  machine: Pick<ApiMachine, "kind" | "slots">;
  locationName: string | null;
}): string => {
  const slotCount = machine.slots.flat().length;
  return [locationName, MACHINE_KIND_LABELS[machine.kind], plural(slotCount, { one: "slot", many: "slots" })]
    .filter(Boolean)
    .join(" · ");
};
