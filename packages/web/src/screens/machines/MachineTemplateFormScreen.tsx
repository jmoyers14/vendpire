import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SlotsField } from "./SlotsField.tsx";
import { Button, ErrorNote, inputClass, Page, PageTitle } from "../../ui.tsx";
import {
  emptySlotsValue,
  shelvesToSlotsValue,
  type SlotsValue,
  slotsValueToShelves,
} from "./slotGrid.ts";
import { queryClient, trpc } from "../../trpc.ts";

interface FormState {
  name: string;
  kind: "snack" | "drink" | "combo";
  make: string;
  model: string;
  slots: SlotsValue;
}

const EMPTY: FormState = {
  name: "",
  kind: "snack",
  make: "",
  model: "",
  slots: emptySlotsValue(),
};

/** Create + edit form: `templateId` present means edit. */
export function MachineTemplateFormScreen({
  templateId,
}: {
  templateId?: string;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const existing = useQuery({
    ...trpc.machineTemplates.get.queryOptions({ id: templateId ?? "" }),
    enabled: Boolean(templateId),
  });

  useEffect(() => {
    const template = existing.data;
    if (!template) {
      return;
    }
    setForm({
      name: template.name,
      kind: template.kind,
      make: template.make ?? "",
      model: template.model ?? "",
      slots: shelvesToSlotsValue(template.slots),
    });
  }, [existing.data]);

  const onSaved = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.machineTemplates.list.queryKey(),
    });
    navigate({ to: "/machines/templates" });
  };
  const create = useMutation(
    trpc.machineTemplates.create.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );
  const update = useMutation(
    trpc.machineTemplates.update.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    const slots = slotsValueToShelves(form.slots);
    if (slots.flat().length === 0) {
      setError("A template needs at least one slot");
      return;
    }
    const data = {
      name: form.name.trim(),
      kind: form.kind,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      slots,
    };
    if (templateId) {
      update.mutate({ id: templateId, ...data });
    } else {
      create.mutate(data);
    }
  };

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  return (
    <Page max="xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>{templateId ? "Edit Template" : "New Template"}</PageTitle>
        <Link
          to="/machines/templates"
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          ← Back
        </Link>
      </div>

      <ErrorNote message={error} />

      <form onSubmit={submit} className="space-y-4">
        <input
          className={inputClass}
          placeholder="Name * (e.g. AMS 39 — 6 shelves)"
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
        <div className="grid grid-cols-2 gap-2">
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
        </div>
        <SlotsField value={form.slots} onChange={(slots) => set({ slots })} />
        <Button
          size="sm"
          type="submit"
          disabled={create.isPending || update.isPending}
        >
          {templateId ? "Save Changes" : "Create Template"}
        </Button>
      </form>
    </Page>
  );
}
