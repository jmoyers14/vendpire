import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { queryClient, trpc } from "../../trpc.ts";
import { plural } from "../../utils/text.ts";
import {
  Alert,
  Badge,
  DeleteSection,
  ErrorNote,
  eyebrowLinkClass,
  Field,
  FieldRow,
  FormSection,
  focusRing,
  Page,
  PageHeader,
  pageLinkClass,
  SaveBar,
  SectionDivider,
  Select,
  Switch,
  TextInput,
  useFormDraft,
} from "../../ui.tsx";
import {
  buildMachineInput,
  buildTemplateInput,
  DEPENDENT_ERROR_KEYS,
  draftFor,
  EMPTY_MACHINE_DRAFT,
  fieldErrorsFor,
  MACHINE_KIND_LABELS,
  type MachineDraft,
  type MachineFieldErrors,
  type MachineKind,
  orphanedSlotCodesFor,
  READER_PROVIDER_LABELS,
  type ReaderProvider,
  templateNamed,
  templatePrefillFor,
} from "./machineForm.ts";
import { SlotsField } from "./SlotsField.tsx";
import { slotsValueToShelves } from "./slotGrid.ts";

const FORM_ID = "machine-form";

/** Create + edit form: `machineId` present means edit. */
export function MachineFormScreen({ machineId }: { machineId?: string }) {
  const navigate = useNavigate();
  const isEditing = Boolean(machineId);
  const { draft, set, load, discard, isDirty } = useFormDraft<MachineDraft>(EMPTY_MACHINE_DRAFT);
  const [errors, setErrors] = useState<MachineFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Loaded once: a refetch on window focus must not wipe edits in progress.
  const [hasLoaded, setHasLoaded] = useState(false);
  // Bumped when a template replaces the layout, so the grid controls reopen to fit it.
  const [layoutVersion, setLayoutVersion] = useState(0);

  const locationsQuery = useQuery(trpc.locations.list.queryOptions());
  const templatesQuery = useQuery(trpc.machineTemplates.list.queryOptions());
  const machineQuery = useQuery({
    ...trpc.machines.get.queryOptions({ id: machineId ?? "" }),
    enabled: isEditing,
  });
  // Which slots the live planogram fills. A new layout can drop some of them,
  // which the warning in Layout calls out.
  const currentPlanogramQuery = useQuery({
    ...trpc.planograms.getCurrent.queryOptions({ machineId: machineId ?? "" }),
    enabled: isEditing,
  });

  useEffect(() => {
    const machine = machineQuery.data;
    if (!machine || hasLoaded) {
      return;
    }
    setHasLoaded(true);
    load(draftFor(machine));
  }, [machineQuery.data, hasLoaded, load]);

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: trpc.machines.list.queryKey() });
    if (machineId) {
      queryClient.invalidateQueries({ queryKey: trpc.machines.get.queryKey({ id: machineId }) });
    }
    navigate({ to: "/machines" });
  };
  const saveCallbacks = {
    onSuccess: handleSaved,
    onError: (error: { message: string }) => setFormError(error.message),
  };
  const create = useMutation(trpc.machines.create.mutationOptions(saveCallbacks));
  const update = useMutation(trpc.machines.update.mutationOptions(saveCallbacks));
  const createTemplate = useMutation(trpc.machineTemplates.create.mutationOptions());

  // An edit clears that field's error, and any error that depended on it.
  const editDraft = (patch: Partial<MachineDraft>) => {
    set(patch);
    const patchedKeys = Object.keys(patch) as (keyof MachineDraft)[];
    setErrors((current) => {
      const next = { ...current };
      for (const key of patchedKeys) {
        delete next[key as keyof MachineFieldErrors];
        const dependentKey = DEPENDENT_ERROR_KEYS[key];
        if (dependentKey) {
          delete next[dependentKey];
        }
      }
      return next;
    });
  };

  // Prefill on pick, never in an effect, which would clobber edits in progress.
  const applyTemplate = (templateId: string) => {
    const template = templatesQuery.data?.find((row) => row.id === templateId);
    if (!template) {
      editDraft({ templateId: null });
      return;
    }
    editDraft(templatePrefillFor({ draft, template }));
    setLayoutVersion((version) => version + 1);
  };

  // Saved before the machine so it can carry the template's id; a same-named
  // template is reused, so a retry after a failed save doesn't clash.
  const saveTemplateIfRequested = async (): Promise<string | null> => {
    if (!draft.shouldSaveAsTemplate) {
      return draft.templateId;
    }
    const reusable = templateNamed({
      name: draft.newTemplateName,
      templates: templatesQuery.data ?? [],
    });
    if (reusable) {
      return reusable.id;
    }
    const savedTemplate = await createTemplate.mutateAsync(buildTemplateInput(draft));
    queryClient.invalidateQueries({ queryKey: trpc.machineTemplates.list.queryKey() });
    return savedTemplate.id;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const fieldErrors = fieldErrorsFor(draft);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      return;
    }
    let templateId: string | null;
    try {
      templateId = await saveTemplateIfRequested();
    } catch (templateError) {
      setFormError(`Couldn't save the template: ${(templateError as Error).message}`);
      return;
    }
    const input = buildMachineInput({ draft, templateId });
    if (machineId) {
      update.mutate({ id: machineId, ...input });
      return;
    }
    create.mutate(input);
  };

  const handleDismiss = () => {
    if (!isEditing) {
      navigate({ to: "/machines" });
      return;
    }
    discard();
    setErrors({});
    setFormError(null);
  };

  const savedMachine = machineQuery.data;
  const savedLocationName = locationsQuery.data?.find(
    (location) => location.id === savedMachine?.locationId,
  )?.name;
  const orphanedSlotCodes = orphanedSlotCodesFor({
    shelves: slotsValueToShelves(draft.slots),
    plannedSlotCodes: (currentPlanogramQuery.data?.slots ?? []).map((slot) => slot.slotCode),
  });
  const templates = templatesQuery.data ?? [];
  const hasNoLocations = locationsQuery.isSuccess && locationsQuery.data.length === 0;

  return (
    <>
      <Page max="form" className="grid gap-8">
        <PageHeader
          eyebrow={
            <>
              <Link to="/machines" className={eyebrowLinkClass}>
                Machines
              </Link>{" "}
              / {isEditing ? "Edit machine" : "New machine"}
            </>
          }
          title={isEditing ? (savedMachine?.name ?? "…") : "New machine"}
          badge={
            isEditing && savedMachine ? (
              <Badge tone={savedMachine.active ? "success" : "neutral"}>
                {savedMachine.active ? "Active" : "Inactive"}
              </Badge>
            ) : undefined
          }
          meta={savedLocationName}
          aside={
            <Link to="/machines" className={pageLinkClass}>
              ← Back to machines
            </Link>
          }
        />

        <ErrorNote
          message={machineQuery.error ? `Couldn't load this machine: ${machineQuery.error.message}` : null}
        />
        <ErrorNote message={formError} />

        <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
          <FormSection title="Placement" description="Where the machine stands and what it sells.">
            <Field label="Name" error={errors.name} hint="e.g. Break room snack">
              <TextInput
                value={draft.name}
                onChange={(event) => editDraft({ name: event.target.value })}
              />
            </Field>
            <FieldRow>
              <Field
                label="Location"
                error={errors.locationId}
                hint={
                  hasNoLocations ? (
                    <>
                      No locations yet.{" "}
                      <Link
                        to="/locations/new"
                        className={`rounded-sm text-link hover:underline ${focusRing}`}
                      >
                        Add one
                      </Link>{" "}
                      first.
                    </>
                  ) : undefined
                }
              >
                <Select
                  value={draft.locationId}
                  onChange={(event) => editDraft({ locationId: event.target.value })}
                >
                  <option value="">Pick a location</option>
                  {locationsQuery.data?.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type">
                <Select
                  value={draft.kind}
                  onChange={(event) => editDraft({ kind: event.target.value as MachineKind })}
                >
                  {Object.entries(MACHINE_KIND_LABELS).map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>
            <SectionDivider />
            <Switch
              title="Active"
              description="Turn this off when a machine leaves your route. Its visits and sales stay in your history."
              isChecked={draft.isActive}
              onChange={(isActive) => editDraft({ isActive })}
            />
          </FormSection>

          <FormSection title="Hardware" description="What's printed on the machine and its reader.">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Make" isOptional>
                <TextInput
                  value={draft.make}
                  onChange={(event) => editDraft({ make: event.target.value })}
                />
              </Field>
              <Field label="Model" isOptional>
                <TextInput
                  value={draft.model}
                  onChange={(event) => editDraft({ model: event.target.value })}
                />
              </Field>
              <Field label="Serial" isOptional>
                <TextInput
                  className="font-mono"
                  value={draft.serial}
                  onChange={(event) => editDraft({ serial: event.target.value })}
                />
              </Field>
            </div>
            <Field label="QR tag" isOptional hint="The code on the sticker, e.g. VP-001.">
              <TextInput
                className="font-mono"
                value={draft.tagCode}
                onChange={(event) => editDraft({ tagCode: event.target.value })}
              />
            </Field>
            <SectionDivider />
            <CardReaderFields draft={draft} errors={errors} onChange={editDraft} />
          </FormSection>

          <FormSection
            title="Layout"
            description="The slots as you see them standing in front of the machine."
          >
            {templates.length > 0 ? (
              <Field
                label="Start from a template"
                isOptional
                hint="Fills in the layout below. The machine keeps its own copy, so later template edits won't touch it."
              >
                <Select
                  value={draft.templateId ?? ""}
                  onChange={(event) => applyTemplate(event.target.value)}
                >
                  <option value="">None</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.slots.flat().length} slots)
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <SlotsField
              // Remounts when a saved layout or a template arrives, so the grid
              // controls open to fit it (e.g. shelf by shelf for a narrower shelf).
              key={`${hasLoaded}-${layoutVersion}`}
              value={draft.slots}
              onChange={(slots) => editDraft({ slots })}
            />
            {orphanedSlotCodes.length > 0 ? (
              <Alert
                tone="warning"
                title={`This layout drops ${plural(orphanedSlotCodes.length, { one: "slot", many: "slots" })} the current planogram fills`}
              >
                <p>
                  <span className="font-mono">{orphanedSlotCodes.join(", ")}</span> would no
                  longer exist on the machine. Saving is fine; those assignments just stop showing.
                  Create a new planogram version to clean them up.
                </p>
              </Alert>
            ) : null}
            <SectionDivider />
            <Switch
              title="Save this layout as a template"
              description="Reuse it the next time you add a machine like this one."
              isChecked={draft.shouldSaveAsTemplate}
              onChange={(shouldSaveAsTemplate) => editDraft({ shouldSaveAsTemplate })}
            />
            {draft.shouldSaveAsTemplate ? (
              <Field
                label="Template name"
                error={errors.newTemplateName}
                hint="e.g. AMS 39, 6 shelves"
              >
                <TextInput
                  value={draft.newTemplateName}
                  onChange={(event) => editDraft({ newTemplateName: event.target.value })}
                />
              </Field>
            ) : null}
          </FormSection>
        </form>

        {machineId && savedMachine ? (
          <DeleteMachineSection machineId={machineId} machineName={savedMachine.name} />
        ) : null}
      </Page>
      <SaveBar
        isDirty={isDirty}
        // "All changes saved" would be untrue for a machine that doesn't exist yet.
        summary={!isEditing && !isDirty ? "Nothing entered yet" : undefined}
        saveLabel={isEditing ? "Save changes" : "Create machine"}
        dismissal={isEditing ? "discard" : "cancel"}
        onDismiss={handleDismiss}
        formId={FORM_ID}
        isSaving={create.isPending || update.isPending || createTemplate.isPending}
      />
    </>
  );
}

/** The reader's provider, then its device ID once there is one. */
function CardReaderFields({
  draft,
  errors,
  onChange,
}: {
  draft: MachineDraft;
  errors: MachineFieldErrors;
  onChange: (patch: Partial<MachineDraft>) => void;
}) {
  const providerField = (
    <Field label="Card reader">
      <Select
        value={draft.readerProvider}
        onChange={(event) =>
          onChange({ readerProvider: event.target.value as ReaderProvider | "" })
        }
      >
        <option value="">None</option>
        {Object.entries(READER_PROVIDER_LABELS).map(([provider, label]) => (
          <option key={provider} value={provider}>
            {label}
          </option>
        ))}
      </Select>
    </Field>
  );
  if (!draft.readerProvider) {
    return providerField;
  }
  return (
    <FieldRow>
      {providerField}
      <Field label="Device ID" error={errors.readerDeviceId}>
        <TextInput
          className="font-mono"
          value={draft.readerDeviceId}
          onChange={(event) => onChange({ readerDeviceId: event.target.value })}
        />
      </Field>
    </FieldRow>
  );
}

/** The server refuses a machine with planogram history and says to make it inactive instead. */
function DeleteMachineSection({
  machineId,
  machineName,
}: {
  machineId: string;
  machineName: string;
}) {
  const navigate = useNavigate();
  const remove = useMutation(
    trpc.machines.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.machines.list.queryKey() });
        navigate({ to: "/machines" });
      },
    }),
  );
  return (
    <DeleteSection
      recordKind="machine"
      recordName={machineName}
      description="For a machine added by mistake. One with a planogram stays; make it inactive instead."
      isDeleting={remove.isPending}
      error={remove.error?.message ?? null}
      onDelete={() => remove.mutate({ id: machineId })}
      onDismiss={() => remove.reset()}
    />
  );
}
