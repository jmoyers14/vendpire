import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SlotFacePreview } from "./SlotFacePreview.tsx";
import { SlotGridEditor } from "./SlotGridEditor.tsx";
import { Button, Card, checkboxClass, ErrorNote, inputClass, Page, PageTitle } from "../../ui.tsx";
import {
  buildRows,
  parseSlotLines,
  rowsToShelves,
  type SlotGridRow,
  shelvesToRows,
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
  slotMode: "grid" | "custom";
  slotRows: SlotGridRow[];
  slotCodesText: string;
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
  slotMode: "grid",
  slotRows: buildRows(6, 8),
  slotCodesText: "",
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

  const existing = useQuery({
    ...trpc.machines.get.queryOptions({ id: machineId ?? "" }),
    enabled: Boolean(machineId),
  });

  useEffect(() => {
    const machine = existing.data;
    if (!machine) {
      return;
    }
    setForm({
      locationId: machine.locationId,
      name: machine.name,
      kind: machine.kind,
      make: machine.make ?? "",
      model: machine.model ?? "",
      serial: machine.serial ?? "",
      tagCode: machine.tagCode ?? "",
      slotMode: shelvesToRows(machine.slots) ? "grid" : "custom",
      slotRows: shelvesToRows(machine.slots) ?? buildRows(6, 8),
      slotCodesText: machine.slots.map((shelf) => shelf.join(" ")).join("\n"),
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

  const submit = (e: React.FormEvent) => {
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
    const data = {
      locationId: form.locationId,
      name: form.name.trim(),
      kind: form.kind,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      serial: form.serial.trim() || null,
      tagCode: form.tagCode.trim() || null,
      slots:
        form.slotMode === "grid"
          ? rowsToShelves(form.slotRows)
          : parseSlotLines(form.slotCodesText),
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

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Slots</span>
            <button
              type="button"
              onClick={() =>
                set(
                  form.slotMode === "grid"
                    ? {
                        slotMode: "custom",
                        slotCodesText: rowsToShelves(form.slotRows)
                          .map((shelf) => shelf.join(" "))
                          .join("\n"),
                      }
                    : {
                        slotMode: "grid",
                        slotRows:
                          shelvesToRows(parseSlotLines(form.slotCodesText)) ??
                          form.slotRows,
                      },
                )
              }
              className="text-xs text-primary-600 hover:text-primary-500"
            >
              {form.slotMode === "grid"
                ? "Enter codes manually"
                : "Use grid generator"}
            </button>
          </div>
          {form.slotMode === "grid" ? (
            <SlotGridEditor
              rows={form.slotRows}
              onChange={(slotRows) => set({ slotRows })}
            />
          ) : (
            <div className="space-y-2">
              <textarea
                className={`${inputClass} font-mono`}
                placeholder={"One shelf per line, codes in walking order:\nA0 A2 A4 A6\nB1 B2 B3 B4 B5"}
                rows={4}
                value={form.slotCodesText}
                onChange={(e) => set({ slotCodesText: e.target.value })}
              />
              <SlotFacePreview shelves={parseSlotLines(form.slotCodesText)} />
              <p className="text-xs text-gray-500">
                {parseSlotLines(form.slotCodesText).flat().length} slot(s)
              </p>
            </div>
          )}
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
          disabled={create.isPending || update.isPending}
        >
          {machineId ? "Save Changes" : "Create Machine"}
        </Button>
      </form>
    </Page>
  );
}
