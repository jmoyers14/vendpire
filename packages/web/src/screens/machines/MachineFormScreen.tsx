import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SlotsField } from "./SlotsField.tsx";
import {
  Alert,
  Button,
  checkboxClass,
  ErrorNote,
  inputClass,
  Page,
  PageTitle,
} from "../../ui.tsx";
import {
  emptySlotsValue,
  shelvesToSlotsValue,
  type SlotsValue,
  slotsValueToShelves,
} from "./slotGrid.ts";
import { queryClient, trpc } from "../../trpc.ts";

interface FormState {
  locationId: string;
  name: string;
  kind: "snack" | "drink" | "combo";
  make: string;
  model: string;
  serial: string;
  tagCode: string;
  /** Layout lineage. Carried through edits so saving doesn't erase it. */
  templateId: string | null;
  slots: SlotsValue;
  saveAsTemplate: boolean;
  newTemplateName: string;
  readerProvider: "" | "nayax" | "cantaloupe";
  readerDeviceId: string;
  active: boolean;
}

const EMPTY: FormState = {
  locationId: "",
  name: "",
  kind: "snack",
  make: "",
  model: "",
  serial: "",
  tagCode: "",
  templateId: null,
  slots: emptySlotsValue(),
  saveAsTemplate: false,
  newTemplateName: "",
  readerProvider: "",
  readerDeviceId: "",
  active: true,
};

/** Create + edit form: `machineId` present means edit. */
export function MachineFormScreen({ machineId }: { machineId?: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const locations = useQuery(trpc.locations.list.queryOptions());
  const templates = useQuery(trpc.machineTemplates.list.queryOptions());

  const existing = useQuery({
    ...trpc.machines.get.queryOptions({ id: machineId ?? "" }),
    enabled: Boolean(machineId),
  });

  // Which slots the machine's live planogram is currently using. Applying a
  // template can drop some of them, which the warning below calls out.
  const currentPlanogram = useQuery({
    ...trpc.planograms.getCurrent.queryOptions({ machineId: machineId ?? "" }),
    enabled: Boolean(machineId),
  });

  useEffect(() => {
    const machine = existing.data;
    if (!machine) {
      return;
    }
    setForm({
      ...EMPTY,
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
      active: machine.active,
    });
  }, [existing.data]);

  const onSaved = () => {
    queryClient.invalidateQueries({ queryKey: trpc.machines.list.queryKey() });
    navigate({ to: "/machines" });
  };
  const create = useMutation(
    trpc.machines.create.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );
  const update = useMutation(
    trpc.machines.update.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );
  const createTemplate = useMutation(
    trpc.machineTemplates.create.mutationOptions(),
  );

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  // Prefill from a template on pick — never in an effect, which would clobber
  // edits in progress. Make/model fill only when blank; kind always applies,
  // since the select has no empty state to test for.
  const applyTemplate = (templateId: string) => {
    const template = templates.data?.find((row) => row.id === templateId);
    if (!template) {
      set({ templateId: null });
      return;
    }
    set({
      templateId: template.id,
      kind: template.kind,
      make: form.make.trim() ? form.make : (template.make ?? ""),
      model: form.model.trim() ? form.model : (template.model ?? ""),
      slots: shelvesToSlotsValue(template.slots),
    });
  };

  const shelves = slotsValueToShelves(form.slots);

  // Slot codes the live planogram fills that this layout no longer has. The
  // save still goes through — slots have always been editable by hand — but
  // those assignments stop showing on the face.
  const orphanedSlots = (() => {
    const slots = currentPlanogram.data?.slots;
    if (!slots) {
      return [];
    }
    const codes = new Set(shelves.flat());
    return slots
      .map((slot) => slot.slotCode)
      .filter((code) => !codes.has(code));
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.locationId) {
      setError("Pick a location");
      return;
    }
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (form.readerProvider && !form.readerDeviceId.trim()) {
      setError("Card reader needs a device ID");
      return;
    }

    // Saved first so the machine can carry the new template's id. A name clash
    // stops here rather than leaving a machine pointing at nothing; on retry
    // the existing template of that name is reused.
    let templateId = form.templateId;
    if (form.saveAsTemplate) {
      const name = form.newTemplateName.trim();
      if (!name) {
        setError("Name the template you're saving");
        return;
      }
      const reusable = templates.data?.find(
        (row) => row.name.toLowerCase() === name.toLowerCase(),
      );
      if (reusable) {
        templateId = reusable.id;
      } else {
        try {
          const saved = await createTemplate.mutateAsync({
            name,
            kind: form.kind,
            make: form.make.trim() || null,
            model: form.model.trim() || null,
            slots: shelves,
          });
          templateId = saved.id;
          queryClient.invalidateQueries({
            queryKey: trpc.machineTemplates.list.queryKey(),
          });
        } catch (templateError) {
          setError(
            `Couldn't save the template: ${(templateError as Error).message}`,
          );
          return;
        }
      }
    }

    const data = {
      locationId: form.locationId,
      name: form.name.trim(),
      kind: form.kind,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      serial: form.serial.trim() || null,
      tagCode: form.tagCode.trim() || null,
      templateId,
      slots: shelves,
      cardReader: form.readerProvider
        ? { provider: form.readerProvider, deviceId: form.readerDeviceId.trim() }
        : null,
      active: form.active,
    };
    if (machineId) {
      update.mutate({ id: machineId, ...data });
    } else {
      create.mutate(data);
    }
  };

  return (
    <Page max="xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>
          {machineId ? "Edit Machine" : "New Machine"}
        </PageTitle>
        <Link to="/machines" className="text-sm text-gray-600 hover:text-gray-800">
          ← Back
        </Link>
      </div>

      <ErrorNote message={error} />

      <form onSubmit={submit} className="space-y-4">
        <select
          className={inputClass}
          value={form.locationId}
          onChange={(e) => set({ locationId: e.target.value })}
        >
          <option value="">Location *</option>
          {locations.data?.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          placeholder="Name * (e.g. Break room snack)"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <select
          className={inputClass}
          value={form.kind}
          onChange={(e) => set({ kind: e.target.value as FormState["kind"] })}
        >
          <option value="snack">Snack</option>
          <option value="drink">Drink</option>
          <option value="combo">Combo</option>
        </select>
        <div className="grid grid-cols-3 gap-2">
          <input
            className={inputClass}
            placeholder="Make"
            value={form.make}
            onChange={(e) => set({ make: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Model"
            value={form.model}
            onChange={(e) => set({ model: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Serial"
            value={form.serial}
            onChange={(e) => set({ serial: e.target.value })}
          />
        </div>
        <input
          className={inputClass}
          placeholder="QR tag code (e.g. VP-001)"
          value={form.tagCode}
          onChange={(e) => set({ tagCode: e.target.value })}
        />

        {templates.data && templates.data.length > 0 ? (
          <div className="space-y-1">
            <select
              className={inputClass}
              value={form.templateId ?? ""}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">Start from a template…</option>
              {templates.data.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.slots.flat().length} slots)
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500">
              Fills in the layout below. The machine keeps its own copy — later
              template edits won't touch it.
            </p>
          </div>
        ) : null}

        <SlotsField value={form.slots} onChange={(slots) => set({ slots })} />

        {orphanedSlots.length > 0 ? (
          <Alert
            tone="warning"
            title={`This layout drops ${orphanedSlots.length} slot(s) the current planogram fills`}
          >
            <p>
              <span className="font-mono">{orphanedSlots.join(", ")}</span> would
              no longer exist on the machine. Saving is fine — those assignments
              just stop showing. Create a new planogram version to clean them up.
            </p>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={form.saveAsTemplate}
              onChange={(e) => set({ saveAsTemplate: e.target.checked })}
            />
            Save this layout as a template
          </label>
          {form.saveAsTemplate ? (
            <input
              className={inputClass}
              placeholder="Template name (e.g. AMS 39 — 6 shelves)"
              value={form.newTemplateName}
              onChange={(e) => set({ newTemplateName: e.target.value })}
            />
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            className={inputClass}
            value={form.readerProvider}
            onChange={(e) =>
              set({ readerProvider: e.target.value as FormState["readerProvider"] })
            }
          >
            <option value="">No card reader</option>
            <option value="cantaloupe">Cantaloupe</option>
            <option value="nayax">Nayax</option>
          </select>
          {form.readerProvider ? (
            <input
              className={inputClass}
              placeholder="Reader device ID"
              value={form.readerDeviceId}
              onChange={(e) => set({ readerDeviceId: e.target.value })}
            />
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={form.active}
            onChange={(e) => set({ active: e.target.checked })}
          />
          Active
        </label>
        <Button
          size="sm"
          type="submit"
          disabled={
            create.isPending || update.isPending || createTemplate.isPending
          }
        >
          {machineId ? "Save Changes" : "Create Machine"}
        </Button>
      </form>
    </Page>
  );
}
