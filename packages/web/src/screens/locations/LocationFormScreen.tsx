import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import {
  Badge,
  DecimalInput,
  DeleteSection,
  ErrorNote,
  eyebrowLinkClass,
  Field,
  FieldRow,
  FormSection,
  MoneyInput,
  Page,
  PageHeader,
  pageLinkClass,
  SaveBar,
  SectionDivider,
  Select,
  Switch,
  TextArea,
  TextInput,
  useFormDraft,
} from "../../ui.tsx";
import { queryClient, trpc } from "../../trpc.ts";
import { AddressAutocomplete } from "./AddressAutocomplete.tsx";
import {
  buildLocationInput,
  type CommissionBasis,
  type CommissionType,
  EMPTY_LOCATION_DRAFT,
  type LocationDraft,
  draftFor,
  type LocationFieldErrors,
} from "./locationForm.ts";

const FORM_ID = "location-form";

/** Create + edit form: `locationId` present means edit. */
export function LocationFormScreen({ locationId }: { locationId?: string }) {
  const navigate = useNavigate();
  const isEditing = Boolean(locationId);
  const { draft, set, load, discard, isDirty } =
    useFormDraft<LocationDraft>(EMPTY_LOCATION_DRAFT);
  const [errors, setErrors] = useState<LocationFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Loaded once: a refetch on window focus must not wipe edits in progress.
  const [hasLoaded, setHasLoaded] = useState(false);

  const existing = useQuery({
    ...trpc.locations.get.queryOptions({ id: locationId ?? "" }),
    enabled: isEditing,
  });

  useEffect(() => {
    const location = existing.data;
    if (!location || hasLoaded) {
      return;
    }
    setHasLoaded(true);
    load(draftFor(location));
  }, [existing.data, hasLoaded, load]);

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: trpc.locations.list.queryKey() });
    if (locationId) {
      queryClient.invalidateQueries({ queryKey: trpc.locations.get.queryKey({ id: locationId }) });
    }
    navigate({ to: "/locations" });
  };
  const saveCallbacks = {
    onSuccess: handleSaved,
    onError: (error: { message: string }) => setFormError(error.message),
  };
  const create = useMutation(trpc.locations.create.mutationOptions(saveCallbacks));
  const update = useMutation(trpc.locations.update.mutationOptions(saveCallbacks));

  // An edit clears that field's error, so a fix doesn't keep showing it. A new
  // commission type clears both amount errors, or switching back would bring one back.
  const editDraft = (patch: Partial<LocationDraft>) => {
    set(patch);
    const clearedKeys: string[] =
      "commissionType" in patch
        ? [...Object.keys(patch), "commissionPercent", "commissionFlat"]
        : Object.keys(patch);
    setErrors((current) => {
      const next = { ...current };
      for (const key of clearedKeys) {
        delete next[key as keyof LocationFieldErrors];
      }
      return next;
    });
  };
  // A hand edit to any address part means the pinned coordinates no longer match.
  const editAddress = (patch: Partial<LocationDraft>) => editDraft({ ...patch, geo: null });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const result = buildLocationInput(draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    if (locationId) {
      update.mutate({ id: locationId, ...result.input });
      return;
    }
    create.mutate(result.input);
  };

  const handleDismiss = () => {
    if (!isEditing) {
      navigate({ to: "/locations" });
      return;
    }
    discard();
    setErrors({});
    setFormError(null);
  };

  const savedLocation = existing.data;
  const savedCity = savedLocation?.address.city;

  return (
    <>
      <Page max="form" className="grid gap-8">
        <PageHeader
          eyebrow={
            <>
              <Link to="/locations" className={eyebrowLinkClass}>
                Locations
              </Link>{" "}
              / {isEditing ? "Edit location" : "New location"}
            </>
          }
          title={isEditing ? (savedLocation?.name ?? "…") : "New location"}
          badge={
            isEditing && savedLocation ? (
              <Badge tone={savedLocation.active ? "success" : "neutral"}>
                {savedLocation.active ? "Active" : "Inactive"}
              </Badge>
            ) : undefined
          }
          meta={savedCity ?? undefined}
          aside={
            <Link to="/locations" className={pageLinkClass}>
              ← Back to locations
            </Link>
          }
        />

        <ErrorNote
          message={existing.error ? `Couldn't load this location: ${existing.error.message}` : null}
        />
        <ErrorNote message={formError} />

        <form id={FORM_ID} onSubmit={handleSubmit} noValidate>
          <FormSection title="Location" description="What you call this spot.">
            <Field label="Name" error={errors.name} hint="e.g. Westside Laundromat">
              <TextInput
                value={draft.name}
                onChange={(event) => editDraft({ name: event.target.value })}
              />
            </Field>
            <SectionDivider />
            <Switch
              title="Active"
              description="Inactive locations stay in history and reports but drop out of pickers."
              isChecked={draft.isActive}
              onChange={(isActive) => editDraft({ isActive })}
            />
          </FormSection>

          <FormSection
            title="Address"
            description="Start typing the street and pick a suggestion to fill the rest."
          >
            <Field label="Street" isOptional>
              <AddressAutocomplete
                value={draft.line1}
                onChange={(line1) => editAddress({ line1 })}
                onResolved={(address) =>
                  editDraft({
                    line1: address.line1 ?? "",
                    city: address.city ?? "",
                    state: address.state ?? "",
                    zip: address.zip ?? "",
                    geo: address.geo,
                  })
                }
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_96px_140px]">
              <Field label="City" isOptional>
                <TextInput
                  value={draft.city}
                  onChange={(event) => editAddress({ city: event.target.value })}
                />
              </Field>
              <Field label="State" isOptional>
                <TextInput
                  value={draft.state}
                  onChange={(event) => editAddress({ state: event.target.value })}
                />
              </Field>
              <Field label="ZIP" isOptional>
                <TextInput
                  inputMode="numeric"
                  className="font-mono tabular-nums"
                  value={draft.zip}
                  onChange={(event) => editAddress({ zip: event.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Contact" description="Who to call about access or a problem with a machine.">
            <Field label="Contact name" isOptional>
              <TextInput
                value={draft.contactName}
                onChange={(event) => editDraft({ contactName: event.target.value })}
              />
            </Field>
            <FieldRow>
              <Field label="Phone" isOptional>
                <TextInput
                  type="tel"
                  value={draft.contactPhone}
                  onChange={(event) => editDraft({ contactPhone: event.target.value })}
                />
              </Field>
              <Field label="Email" isOptional>
                <TextInput
                  type="email"
                  value={draft.contactEmail}
                  onChange={(event) => editDraft({ contactEmail: event.target.value })}
                />
              </Field>
            </FieldRow>
          </FormSection>

          <FormSection title="Commission" description="What you pay the location for hosting your machines.">
            <CommissionFields draft={draft} errors={errors} onChange={editDraft} />
          </FormSection>

          <FormSection title="Notes" description="Anything worth remembering about this spot.">
            <Field label="Notes" isOptional>
              <TextArea
                rows={3}
                placeholder="e.g. Key is with the front desk; machines are by the back door"
                value={draft.notes}
                onChange={(event) => editDraft({ notes: event.target.value })}
              />
            </Field>
          </FormSection>
        </form>

        {locationId && savedLocation ? (
          <DeleteLocationSection locationId={locationId} locationName={savedLocation.name} />
        ) : null}
      </Page>
      <SaveBar
        isDirty={isDirty}
        // "All changes saved" would be untrue for a location that doesn't exist yet.
        summary={!isEditing && !isDirty ? "Nothing entered yet" : undefined}
        saveLabel={isEditing ? "Save changes" : "Create location"}
        dismissal={isEditing ? "discard" : "cancel"}
        onDismiss={handleDismiss}
        formId={FORM_ID}
        isSaving={create.isPending || update.isPending}
      />
    </>
  );
}

/** The commission type, then only the fields that type takes. */
function CommissionFields({
  draft,
  errors,
  onChange,
}: {
  draft: LocationDraft;
  errors: LocationFieldErrors;
  onChange: (patch: Partial<LocationDraft>) => void;
}) {
  return (
    <>
      <Field label="Type">
        <Select
          value={draft.commissionType}
          onChange={(event) => onChange({ commissionType: event.target.value as CommissionType })}
        >
          <option value="none">None</option>
          <option value="percent">Percent of sales</option>
          <option value="flat">Flat amount</option>
        </Select>
      </Field>
      {draft.commissionType === "percent" ? (
        <FieldRow>
          <Field label="Percent" error={errors.commissionPercent}>
            <DecimalInput
              placeholder="10"
              suffix="%"
              value={draft.commissionPercent}
              onChange={(event) => onChange({ commissionPercent: event.target.value })}
            />
          </Field>
          <Field label="Of">
            <Select
              value={draft.commissionBasis}
              onChange={(event) =>
                onChange({ commissionBasis: event.target.value as CommissionBasis })
              }
            >
              <option value="gross">Gross sales</option>
              <option value="net">Net sales (after card fees)</option>
            </Select>
          </Field>
        </FieldRow>
      ) : null}
      {draft.commissionType === "flat" ? (
        <Field label="Amount" error={errors.commissionFlat} hint="Paid each period.">
          <MoneyInput
            placeholder="50.00"
            value={draft.commissionFlat}
            onChange={(event) => onChange({ commissionFlat: event.target.value })}
          />
        </Field>
      ) : null}
    </>
  );
}

/** The server refuses a location that still has machines, and says why. */
function DeleteLocationSection({
  locationId,
  locationName,
}: {
  locationId: string;
  locationName: string;
}) {
  const navigate = useNavigate();
  const remove = useMutation(
    trpc.locations.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.locations.list.queryKey() });
        navigate({ to: "/locations" });
      },
    }),
  );
  return (
    <DeleteSection
      recordKind="location"
      recordName={locationName}
      description="Remove this location from your list."
      isDeleting={remove.isPending}
      error={remove.error?.message ?? null}
      onDelete={() => remove.mutate({ id: locationId })}
      onDismiss={() => remove.reset()}
    />
  );
}
