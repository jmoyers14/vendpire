import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type SlotRuleViolation, slotRuleViolation } from "@vendpire/domain";
import { useEffect, useRef, useState } from "react";
import type { ApiPlanogram } from "../../apiTypes.ts";
import { queryClient, trpc } from "../../trpc.ts";
import { shelfLabel } from "../../ui/machineMap.ts";
import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorNote,
  eyebrowLinkClass,
  Field,
  IconButton,
  MachineMap,
  type MachineTile,
  MoneyInput,
  NumberInput,
  Page,
  PageHeader,
  RowTable,
  RowTableBody,
  RowTableCellLabel,
  RowTableHeader,
  RowTableRow,
  SaveBar,
} from "../../ui.tsx";
import { formatShortDateTime } from "../../utils/dates.ts";
import { centsToInput, formatCents, parseDollarsToCents } from "../../utils/money.ts";
import { plural } from "../../utils/text.ts";
import { EditorCard, EditorFooter, SlotEditorHeader } from "../visits/SlotEditor.tsx";
import { ProductCombobox, type ProductOption } from "./ProductCombobox.tsx";
import {
  buildEditorSlots,
  type DraftSlot,
  entriesInSlot,
  stockLeftOut,
  usePlanogramDraft,
  withEntryAdded,
  withEntryMoved,
  withEntryPatched,
  withEntryRemoved,
  withSlotPrice,
} from "./planogramDraft.ts";
import { planogramTileFor, slotPositionLabel } from "./planogramTiles.ts";

/** Saved · Slots · View. */
const VERSION_COLUMNS = "minmax(0,1fr) 56px 64px";

const MAP_SEARCH = { label: "Find a slot or product", placeholder: "Find a slot or product" };

/**
 * A machine's planogram: the current version, its history, and an editor that
 * saves a NEW immutable version (prefilled from the current one, so a weekly
 * tweak is edit-two-rows-and-save). Edits autosave as a local draft.
 */
export function MachinePlanogramsScreen({ machineId }: { machineId: string }) {
  const [error, setError] = useState<string | null>(null);
  // Null while not editing.
  const [rows, setRows] = useState<DraftSlot[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Null shows the current version.
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const { draft, save: saveDraft, discard: discardDraft } = usePlanogramDraft(machineId);

  const machine = useQuery(trpc.machines.get.queryOptions({ id: machineId }));
  const products = useQuery(trpc.products.list.queryOptions());
  const versions = useQuery(trpc.planograms.listByMachine.queryOptions({ machineId }));
  const previousVisits = useQuery(trpc.visits.list.queryOptions({ machineId, limit: 1 }));
  const current = versions.data?.[0] ?? null;
  const isLoaded = machine.data !== undefined && versions.data !== undefined;
  const machineName = machine.data?.name ?? "…";
  const shelves = machine.data?.slots ?? [];
  const slotCodes = shelves.flat();

  // Prefer the draft; otherwise prefill from the current version (an empty
  // product means the slot is left unassigned and is dropped on save).
  const startEditing = () => {
    if (!machine.data) {
      return;
    }
    const startingSlots =
      draft ??
      (current?.slots ?? []).map((slot) => ({
        slotCode: slot.slotCode,
        productId: slot.productId,
        par: String(slot.par),
        price: centsToInput(slot.priceCents),
      }));
    setSelected(slotCodes[0] ?? null);
    setRows(buildEditorSlots(slotCodes, startingSlots));
  };

  // Coming back to the screen with a draft drops you straight into it.
  useEffect(() => {
    if (isLoaded && draft) {
      startEditing();
    }
  }, [isLoaded]);

  // Save is pressed at the bottom of the window; bring a refusal into view there.
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [error]);

  const updateRows = (next: DraftSlot[]) => {
    setRows(next);
    saveDraft(next);
  };

  const closeEditor = ({ keepDraft }: { keepDraft: boolean }) => {
    if (!keepDraft) {
      discardDraft();
    }
    setRows(null);
    setError(null);
  };

  const create = useMutation(
    trpc.planograms.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.planograms.listByMachine.queryKey({ machineId }),
        });
        setViewedVersionId(null);
        closeEditor({ keepDraft: false });
      },
      onError: (e) => setError(e.message),
    }),
  );

  const productName = (id: string): string =>
    products.data?.find((product) => product.id === id)?.name ?? id;

  const ruleMessage = (violation: SlotRuleViolation): string => {
    switch (violation.kind) {
      case "unknown-slot":
        return `This machine has no slot ${violation.slotCode}`;
      case "duplicate-product":
        return `Slot ${violation.slotCode}: ${productName(violation.productId)} is listed twice`;
      case "mixed-price":
        return `Slot ${violation.slotCode} has more than one price`;
    }
  };

  const save = () => {
    if (!rows) {
      return;
    }
    setError(null);
    const slots = [];
    for (const row of rows) {
      if (!row.productId) {
        continue;
      }
      const par = Number.parseInt(row.par, 10);
      const priceCents = parseDollarsToCents(row.price);
      if (Number.isNaN(par) || par < 1) {
        setError(`Slot ${row.slotCode}: par must be a positive number`);
        return;
      }
      if (priceCents === null) {
        setError(`Slot ${row.slotCode}: price must be a dollar amount`);
        return;
      }
      slots.push({ slotCode: row.slotCode, productId: row.productId, par, priceCents });
    }
    if (slots.length === 0) {
      setError("Assign at least one slot");
      return;
    }
    const violation = slotRuleViolation(slots, new Set(slotCodes));
    if (violation) {
      setError(ruleMessage(violation));
      return;
    }
    create.mutate({ machineId, slots });
  };

  const machinesLink = (
    <Link to="/machines" className={eyebrowLinkClass}>
      Machines
    </Link>
  );

  if (rows) {
    const assignedRows = rows.filter((row) => row.productId);
    const droppedStock = stockLeftOut({
      entries: assignedRows,
      previousLines: previousVisits.data?.[0]?.lines ?? [],
    });
    const assignedSummary = `${assignedSlotCount(assignedRows)} of ${plural(slotCodes.length, { one: "slot", many: "slots" })} assigned`;
    const selectedIndex = selected ? slotCodes.indexOf(selected) : -1;
    const shelfLabelOf = (slotCode: string): string => {
      const index = shelves.findIndex((shelf) => shelf.includes(slotCode));
      return index < 0 ? "" : shelfLabel(shelves[index] ?? [], index);
    };
    const draftTileFor = (slotCode: string): MachineTile =>
      planogramTileFor({
        slotCode,
        entries: entriesInSlot(rows, slotCode)
          .filter((entry) => entry.productId)
          .map((entry) => {
            const priceCents = parseDollarsToCents(entry.price);
            return {
              productName: productName(entry.productId),
              price: priceCents === null ? null : formatCents(priceCents),
            };
          }),
      });

    return (
      <>
        <Page max="wide" className="grid gap-6">
          <PageHeader
            eyebrow={<>{machinesLink} / Planogram / {current ? "New version" : "Set up"}</>}
            title={machineName}
            meta="Your changes stay on this device as a draft until you save the new version."
            aside={
              <Button variant="text" onClick={() => closeEditor({ keepDraft: true })}>
                Close and keep draft
              </Button>
            }
          />

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)]">
            <aside aria-label="Machine map" className="grid min-w-0 gap-4 lg:sticky lg:top-6">
              <Card className="grid gap-4 border border-line p-5">
                <h2 className="font-display text-heading text-ink">Machine</h2>
                <MachineMap
                  shelves={shelves}
                  tileFor={draftTileFor}
                  selectedCode={selected}
                  onSelect={setSelected}
                  search={MAP_SEARCH}
                />
                <p className="text-body-sm text-ink-soft tabular-nums">{assignedSummary}</p>
              </Card>
            </aside>

            {selected ? (
              <SlotEditPanel
                key={selected}
                slotCode={selected}
                shelfLabel={shelfLabelOf(selected)}
                entries={entriesInSlot(rows, selected)}
                products={products.data ?? []}
                productName={productName}
                onRowsChange={(change) => updateRows(change(rows))}
                isFirstSlot={selectedIndex <= 0}
                isLastSlot={selectedIndex === slotCodes.length - 1}
                onPrevious={() => setSelected(slotCodes[selectedIndex - 1] ?? selected)}
                onNext={() => setSelected(slotCodes[selectedIndex + 1] ?? selected)}
              />
            ) : null}
          </div>

          {droppedStock.length > 0 ? (
            <Alert tone="warning" title="Stock the next visit won't ask about">
              The last visit left these in the machine, and this version no longer lists them, so
              they'll go uncounted:{" "}
              {droppedStock
                .map((left) => `${left.slotCode} ${productName(left.productId)} (${left.units})`)
                .join(", ")}
              . Save anyway if you pulled them out.
            </Alert>
          ) : null}

          {error ? (
            <div ref={errorRef} className="scroll-mb-28">
              <ErrorNote message={error} />
            </div>
          ) : null}
        </Page>
        <SaveBar
          width="wide"
          // An open editor is a draft: there's always something to save or discard.
          isDirty
          summary={assignedSummary}
          saveLabel="Save new version"
          onDismiss={() => closeEditor({ keepDraft: false })}
          onSave={save}
          isSaving={create.isPending}
        />
      </>
    );
  }

  const viewed = versions.data?.find((version) => version.id === viewedVersionId) ?? current;
  const isViewingOlder = Boolean(viewed && current && viewed.id !== current.id);
  let startLabel = current ? "New version" : "Set up planogram";
  if (draft) {
    startLabel = "Resume draft";
  }
  const loadError = machine.error ?? versions.error;

  return (
    <Page max="wide" className="grid gap-6">
      <PageHeader
        eyebrow={<>{machinesLink} / Planogram</>}
        title={machineName}
        meta={
          current
            ? `Current since ${formatShortDateTime(current.effectiveFrom)} · ${assignedSlotCount(current.slots)} of ${plural(slotCodes.length, { one: "slot", many: "slots" })} assigned`
            : undefined
        }
        aside={
          <Button onClick={startEditing} disabled={!machine.data}>
            {startLabel}
          </Button>
        }
      />

      <ErrorNote message={loadError ? `Couldn't load this planogram: ${loadError.message}` : null} />

      {isLoaded ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="grid gap-4 border border-line p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-heading text-ink">
                {isViewingOlder && viewed
                  ? `Version from ${formatShortDateTime(viewed.effectiveFrom)}`
                  : "Current planogram"}
              </h2>
              {isViewingOlder ? (
                <Button variant="text" size="sm" onClick={() => setViewedVersionId(null)}>
                  Back to current
                </Button>
              ) : null}
            </div>
            {viewed ? (
              <MachineMap
                shelves={shelves}
                tileFor={(slotCode) => savedTileFor({ version: viewed, slotCode, productName })}
                search={MAP_SEARCH}
              />
            ) : (
              <p className="text-body text-ink-soft">
                No planogram yet. Set one up so each visit knows what every slot holds and what
                it sells for.
              </p>
            )}
          </Card>

          {versions.data && versions.data.length > 0 ? (
            <VersionsCard
              versions={versions.data}
              shownVersionId={viewed?.id ?? null}
              onView={(id) => setViewedVersionId(id === current?.id ? null : id)}
            />
          ) : null}
        </div>
      ) : loadError ? null : (
        <p className="text-body text-muted-strong">Loading…</p>
      )}
    </Page>
  );
}

/** A saved version's slot: products front to back over the slot's price. */
const savedTileFor = ({
  version,
  slotCode,
  productName,
}: {
  version: ApiPlanogram;
  slotCode: string;
  productName: (id: string) => string;
}): MachineTile =>
  planogramTileFor({
    slotCode,
    entries: version.slots
      .filter((entry) => entry.slotCode === slotCode)
      .map((entry) => ({
        productName: productName(entry.productId),
        price: formatCents(entry.priceCents),
      })),
  });

/** Every saved version, newest first. View puts one on the map. */
function VersionsCard({
  versions,
  shownVersionId,
  onView,
}: {
  versions: ApiPlanogram[];
  shownVersionId: string | null;
  onView: (versionId: string) => void;
}) {
  return (
    <Card className="grid gap-3 border border-line p-5">
      <h2 className="font-display text-heading text-ink">Versions</h2>
      <RowTable columns={VERSION_COLUMNS} variant="plain">
        <RowTableHeader>
          <span>Saved</span>
          <span className="text-right">Slots</span>
          <span className="sr-only">View</span>
        </RowTableHeader>
        <RowTableBody>
          {versions.map((version, index) => {
            const savedAt = formatShortDateTime(version.effectiveFrom);
            const isShown = version.id === shownVersionId;
            return (
              <RowTableRow key={version.id}>
                <span className="flex min-w-0 flex-wrap items-center gap-2 text-body-sm text-ink">
                  {savedAt}
                  {index === 0 ? (
                    <Badge tone="action" size="sm">
                      Current
                    </Badge>
                  ) : null}
                </span>
                <span className="text-right font-mono text-mono text-ink tabular-nums">
                  <RowTableCellLabel>Slots</RowTableCellLabel>
                  {assignedSlotCount(version.slots)}
                </span>
                <span className="text-right">
                  {isShown ? (
                    <span className="text-body-sm text-muted-strong">Shown</span>
                  ) : (
                    <Button
                      variant="text"
                      size="sm"
                      aria-label={`View version from ${savedAt}`}
                      onClick={() => onView(version.id)}
                    >
                      View
                    </Button>
                  )}
                </span>
              </RowTableRow>
            );
          })}
        </RowTableBody>
      </RowTable>
    </Card>
  );
}

interface SlotEditPanelProps {
  slotCode: string;
  shelfLabel: string;
  /** The slot's products, front to back. An empty slot has one blank entry. */
  entries: DraftSlot[];
  products: ProductOption[];
  productName: (id: string) => string;
  /** Applies one of the planogramDraft helpers to the whole draft. */
  onRowsChange: (change: (rows: DraftSlot[]) => DraftSlot[]) => void;
  isFirstSlot: boolean;
  isLastSlot: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * One slot's price, then each product front to back. Picking a single-product
 * slot's product fills in its default price; in a mixed slot the slot's price
 * stands, since the machine charges per slot.
 */
function SlotEditPanel({
  slotCode,
  shelfLabel,
  entries,
  products,
  productName,
  onRowsChange,
  isFirstSlot,
  isLastSlot,
  onPrevious,
  onNext,
}: SlotEditPanelProps) {
  const price = entries[0]?.price ?? "";
  const canAddBehind = entries.every((entry) => entry.productId);
  const productNames = entries
    .filter((entry) => entry.productId)
    .map((entry) => productName(entry.productId));

  return (
    <EditorCard label={`Edit slot ${slotCode}`}>
      <SlotEditorHeader
        slotCode={slotCode}
        shelfLabel={shelfLabel}
        productNames={productNames}
        price={
          <Field label="Slot price" className="sm:w-36">
            <MoneyInput
              size="sm"
              value={price}
              onChange={(event) =>
                onRowsChange((rows) => withSlotPrice(rows, { slotCode, price: event.target.value }))
              }
            />
          </Field>
        }
      />

      <ul className="grid gap-5">
        {entries.map((entry, index) => {
          const position = slotPositionLabel({ index, count: entries.length });
          return (
            <li
              // Position is the identity here: a blank entry has no product yet.
              key={index}
              className="grid grid-cols-[96px_auto] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_96px_auto]"
            >
              <Field
                label={position ? `${position} product` : "Product"}
                className="col-span-2 sm:col-span-1"
              >
                <ProductCombobox
                  products={products}
                  productId={entry.productId}
                  onPick={(product) =>
                    onRowsChange((rows) => {
                      const picked = withEntryPatched(
                        rows,
                        { slotCode, index },
                        { productId: product.id, par: entry.par || "10" },
                      );
                      return entries.length === 1
                        ? withSlotPrice(picked, {
                            slotCode,
                            price: centsToInput(product.defaultPriceCents),
                          })
                        : picked;
                    })
                  }
                />
              </Field>
              <Field label="Par">
                <NumberInput
                  size="sm"
                  value={entry.par}
                  onChange={(event) =>
                    onRowsChange((rows) =>
                      withEntryPatched(rows, { slotCode, index }, { par: event.target.value }),
                    )
                  }
                />
              </Field>
              <div className="flex h-11 items-center gap-1">
                {entries.length > 1 ? (
                  <>
                    <IconButton
                      label={`Move ${position.toLowerCase()} product forward`}
                      disabled={index === 0}
                      onClick={() =>
                        onRowsChange((rows) => withEntryMoved(rows, { slotCode, index, offset: -1 }))
                      }
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      label={`Move ${position.toLowerCase()} product back`}
                      disabled={index === entries.length - 1}
                      onClick={() =>
                        onRowsChange((rows) => withEntryMoved(rows, { slotCode, index, offset: 1 }))
                      }
                    >
                      ↓
                    </IconButton>
                  </>
                ) : null}
                <Button
                  variant="text"
                  size="sm"
                  disabled={!entry.productId && entries.length === 1}
                  onClick={() => onRowsChange((rows) => withEntryRemoved(rows, { slotCode, index }))}
                >
                  {entries.length > 1 ? "Remove" : "Clear"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!canAddBehind}
          onClick={() => onRowsChange((rows) => withEntryAdded(rows, slotCode))}
        >
          Add a product behind
        </Button>
      </div>

      <EditorFooter hint="Saved as a draft on this device as you go">
        <Button variant="secondary" onClick={onPrevious} disabled={isFirstSlot}>
          Previous
        </Button>
        <Button variant="secondary" onClick={onNext} disabled={isLastSlot}>
          Next slot →
        </Button>
      </EditorFooter>
    </EditorCard>
  );
}

/** A mixed slot lists several entries but counts as one slot. */
const assignedSlotCount = (slots: { slotCode: string }[]): number =>
  new Set(slots.map((slot) => slot.slotCode)).size;
