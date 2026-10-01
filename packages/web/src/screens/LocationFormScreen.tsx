import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AddressAutocomplete } from "../components/AddressAutocomplete.tsx";
import { Button, checkboxClass, ErrorNote, inputClass, Page, PageTitle } from "../components/ui.tsx";
import { parseDollarsToCents, parsePercentToBps } from "../lib/money.ts";
import { queryClient, trpc } from "../trpc.ts";

interface FormState {
  name: string;
  line1: string;
  geo: { lat: number; lng: number } | null;
  city: string;
  state: string;
  zip: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  commissionType: "none" | "percent" | "flat";
  commissionPercent: string;
  commissionBasis: "gross" | "net";
  commissionFlat: string;
  notes: string;
  active: boolean;
}

const EMPTY: FormState = {
  name: "",
  line1: "",
  geo: null,
  city: "",
  state: "CA",
  zip: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  commissionType: "none",
  commissionPercent: "",
  commissionBasis: "gross",
  commissionFlat: "",
  notes: "",
  active: true,
};

/** Create + edit form: `locationId` present means edit. */
export function LocationFormScreen({ locationId }: { locationId?: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const existing = useQuery({
    ...trpc.locations.get.queryOptions({ id: locationId ?? "" }),
    enabled: Boolean(locationId),
  });

  useEffect(() => {
    const location = existing.data;
    if (!location) {
      return;
    }
    setForm({
      name: location.name,
      line1: location.address.line1 ?? "",
      geo: location.address.geo,
      city: location.address.city ?? "",
      state: location.address.state ?? "",
      zip: location.address.zip ?? "",
      contactName: location.contact.name ?? "",
      contactPhone: location.contact.phone ?? "",
      contactEmail: location.contact.email ?? "",
      commissionType: location.commission.type,
      commissionPercent:
        location.commission.percentBps !== null
          ? String(location.commission.percentBps / 100)
          : "",
      commissionBasis: location.commission.basis ?? "gross",
      commissionFlat:
        location.commission.flatCents !== null
          ? String(location.commission.flatCents / 100)
          : "",
      notes: location.notes ?? "",
      active: location.active,
    });
  }, [existing.data]);

  const onSaved = () => {
    queryClient.invalidateQueries({ queryKey: trpc.locations.list.queryKey() });
    navigate({ to: "/locations" });
  };
  const create = useMutation(
    trpc.locations.create.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );
  const update = useMutation(
    trpc.locations.update.mutationOptions({
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

    let commission:
      | { type: "none" }
      | { type: "percent"; percentBps: number; basis: "gross" | "net" }
      | { type: "flat"; flatCents: number };
    if (form.commissionType === "percent") {
      const percentBps = parsePercentToBps(form.commissionPercent);
      if (percentBps === null) {
        setError("Commission percent must be between 0 and 100");
        return;
      }
      commission = { type: "percent", percentBps, basis: form.commissionBasis };
    } else if (form.commissionType === "flat") {
      const flatCents = parseDollarsToCents(form.commissionFlat);
      if (flatCents === null || flatCents === 0) {
        setError("Flat commission must be a dollar amount");
        return;
      }
      commission = { type: "flat", flatCents };
    } else {
      commission = { type: "none" };
    }

    const data = {
      name: form.name.trim(),
      address: {
        line1: form.line1.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        geo: form.geo,
      },
      contact: {
        name: form.contactName.trim() || null,
        phone: form.contactPhone.trim() || null,
        email: form.contactEmail.trim() || null,
      },
      commission,
      notes: form.notes.trim() || null,
      active: form.active,
    };
    if (locationId) {
      update.mutate({ id: locationId, ...data });
    } else {
      create.mutate(data);
    }
  };

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  return (
    <Page max="xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>
          {locationId ? "Edit Location" : "New Location"}
        </PageTitle>
        <Link to="/locations" className="text-sm text-gray-600 hover:text-gray-800">
          ← Back
        </Link>
      </div>

      <ErrorNote message={error} />

      <form onSubmit={submit} className="space-y-4">
        <input
          className={inputClass}
          placeholder="Name *"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Address</legend>
          <AddressAutocomplete
            placeholder="Street — start typing for suggestions"
            value={form.line1}
            onChange={(line1) => set({ line1, geo: null })}
            onResolved={(address) =>
              set({
                line1: address.line1 ?? "",
                city: address.city ?? "",
                state: address.state ?? "",
                zip: address.zip ?? "",
                geo: address.geo,
              })
            }
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              className={inputClass}
              placeholder="City"
              value={form.city}
              onChange={(e) => set({ city: e.target.value, geo: null })}
            />
            <input
              className={inputClass}
              placeholder="State"
              value={form.state}
              onChange={(e) => set({ state: e.target.value, geo: null })}
            />
            <input
              className={inputClass}
              placeholder="ZIP"
              value={form.zip}
              onChange={(e) => set({ zip: e.target.value, geo: null })}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Contact</legend>
          <input
            className={inputClass}
            placeholder="Contact name"
            value={form.contactName}
            onChange={(e) => set({ contactName: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass}
              placeholder="Phone"
              value={form.contactPhone}
              onChange={(e) => set({ contactPhone: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Email"
              value={form.contactEmail}
              onChange={(e) => set({ contactEmail: e.target.value })}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">
            Commission
          </legend>
          <select
            className={inputClass}
            value={form.commissionType}
            onChange={(e) =>
              set({ commissionType: e.target.value as FormState["commissionType"] })
            }
          >
            <option value="none">None</option>
            <option value="percent">Percent of sales</option>
            <option value="flat">Flat amount</option>
          </select>
          {form.commissionType === "percent" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputClass}
                placeholder="Percent (e.g. 10)"
                value={form.commissionPercent}
                onChange={(e) => set({ commissionPercent: e.target.value })}
              />
              <select
                className={inputClass}
                value={form.commissionBasis}
                onChange={(e) =>
                  set({ commissionBasis: e.target.value as "gross" | "net" })
                }
              >
                <option value="gross">Of gross sales</option>
                <option value="net">Of net (after card fees)</option>
              </select>
            </div>
          ) : null}
          {form.commissionType === "flat" ? (
            <input
              className={inputClass}
              placeholder="Dollars per period (e.g. 50)"
              value={form.commissionFlat}
              onChange={(e) => set({ commissionFlat: e.target.value })}
            />
          ) : null}
        </fieldset>

        <textarea
          className={inputClass}
          placeholder="Notes"
          rows={2}
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />

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
          {locationId ? "Save Changes" : "Create Location"}
        </Button>
      </form>
    </Page>
  );
}
