import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type SlotRuleViolation, slotRuleViolation } from "@vendpire/domain";
import {
  Alert,
  Button,
  buildProductsCell,
  ErrorNote,
  inputClass,
  Page,
  PageTitle,
  SlotFaceGrid,
  slotPositionLabel,
} from "../../ui.tsx";
import {
  centsToInput,
  formatCents,
  parseDollarsToCents,
} from "../../utils/money.ts";
import { queryClient, trpc } from "../../trpc.ts";
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
import { ProductCombobox, type ProductOption } from "./ProductCombobox.tsx";

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
  const { draft, save: saveDraft, discard: discardDraft } =
    usePlanogramDraft(machineId);

  const machine = useQuery(trpc.machines.get.queryOptions({ id: machineId }));
  const products = useQuery(trpc.products.list.queryOptions());
  const versions = useQuery(
    trpc.planograms.listByMachine.queryOptions({ machineId }),
  );
  const previousVisits = useQuery(
    trpc.visits.list.queryOptions({ machineId, limit: 1 }),
  );
  const current = versions.data?.[0] ?? null;
  const isLoaded = machine.data !== undefined && versions.data !== undefined;
  const machineName = machine.data?.name ?? "…";

  // Prefer the draft; otherwise prefill from the current version (an empty
  // product means the slot is left unassigned and is dropped on save).
  const startEditing = () => {
    if (!machine.data) {
      return;
    }
    const slotCodes = machine.data.slots.flat();
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

  const droppedStock = rows
    ? stockLeftOut({
        entries: rows.filter((row) => row.productId),
        previousLines: previousVisits.data?.[0]?.lines ?? [],
      })
    : [];

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
    const violation = slotRuleViolation(
      slots,
      new Set(machine.data?.slots.flat() ?? []),
    );
    if (violation) {
      setError(ruleMessage(violation));
      return;
    }
    create.mutate({ machineId, slots });
  };

  const title = rows
    ? `${current ? "New planogram version" : "New planogram"} for ${machineName}`
    : `Planogram — ${machineName}`;
  let startLabel = current ? "New Version" : "Set Up Planogram";
  if (draft) {
    startLabel = "Resume Draft";
  }

  return (
    <Page max="4xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>{title}</PageTitle>
        <Link to="/machines" className="text-sm text-gray-600 hover:text-gray-800">
          ← Machines
        </Link>
      </div>

      <ErrorNote message={error} />

      {rows ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Changes are kept as a draft on this device until you save the new
            version.
          </p>

          {/* The machine face — click a cell to edit that slot. */}
          <SlotFaceGrid
            shelves={machine.data?.slots ?? []}
            selectedCode={selected}
            onSelect={setSelected}
            renderCell={(slotCode) => {
              const entries = entriesInSlot(rows, slotCode).filter(
                (entry) => entry.productId,
              );
              const [front] = entries;
              return buildProductsCell({
                slotCode,
                products: entries.map((entry) => ({
                  id: entry.productId,
                  name: productName(entry.productId),
                })),
                detail: front
                  ? `${front.price ? `$${front.price}` : "—"} · par ${front.par || "—"}`
                  : null,
                emptyLabel: "empty",
              });
            }}
          />

          {/* Edit panel for the selected slot. */}
          {selected ? (
            <SlotEditPanel
              key={selected}
              slotCode={selected}
              entries={entriesInSlot(rows, selected)}
              products={products.data ?? []}
              onRowsChange={(change) => updateRows(change(rows))}
              onNext={() => {
                const order = machine.data?.slots.flat() ?? [];
                const index = order.indexOf(selected);
                setSelected(order[(index + 1) % order.length] ?? null);
              }}
            />
          ) : null}

          {droppedStock.length > 0 ? (
            <Alert tone="warning" title="Stock the next visit won't ask about">
              The last visit left these in the machine, and this version no
              longer lists them, so they'll go uncounted:{" "}
              {droppedStock
                .map(
                  (left) =>
                    `${left.slotCode} ${productName(left.productId)} (${left.units})`,
                )
                .join(", ")}
              . Save anyway if you pulled them out.
            </Alert>
          ) : null}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={save}
              disabled={create.isPending}
            >
              Save New Version
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => closeEditor({ keepDraft: true })}
            >
              Save Draft
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => closeEditor({ keepDraft: false })}
            >
              Discard Draft
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {current
                ? `Current since ${new Date(current.effectiveFrom).toLocaleDateString()} · ${assignedSlotCount(current.slots)} slot(s) assigned`
                : "No planogram yet."}
            </p>
            <Button
              size="sm"
              onClick={startEditing}
              disabled={!machine.data}
            >
              {startLabel}
            </Button>
          </div>

          {current && machine.data ? (
            <SlotFaceGrid
              shelves={machine.data.slots}
              renderCell={(slotCode) => {
                const entries = current.slots.filter(
                  (entry) => entry.slotCode === slotCode,
                );
                const [front] = entries;
                return buildProductsCell({
                  slotCode,
                  products: entries.map((entry) => ({
                    id: entry.productId,
                    name: productName(entry.productId),
                  })),
                  detail: front
                    ? `${formatCents(front.priceCents)} · par ${front.par}`
                    : null,
                });
              }}
            />
          ) : null}

          {versions.data && versions.data.length > 1 ? (
            <div>
              <h2 className="mb-1 text-sm font-medium text-gray-700">History</h2>
              <ul className="space-y-1 text-sm text-gray-600">
                {versions.data.slice(1).map((version) => (
                  <li key={version.id}>
                    {new Date(version.effectiveFrom).toLocaleString()} —{" "}
                    {assignedSlotCount(version.slots)} slot(s)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}

interface SlotEditPanelProps {
  slotCode: string;
  /** The slot's products, front to back. An empty slot has one blank entry. */
  entries: DraftSlot[];
  products: ProductOption[];
  /** Applies one of the planogramDraft helpers to the whole draft. */
  onRowsChange: (change: (rows: DraftSlot[]) => DraftSlot[]) => void;
  onNext: () => void;
}

/**
 * One slot's price, then each product front to back. Picking a single-product
 * slot's product fills in its default price; in a mixed slot the slot's price
 * stands, since the machine charges per slot.
 */
function SlotEditPanel({
  slotCode,
  entries,
  products,
  onRowsChange,
  onNext,
}: SlotEditPanelProps) {
  const price = entries[0]?.price ?? "";
  const canAddBehind = entries.every((entry) => entry.productId);

  return (
    <div className="flex flex-col gap-2 rounded border border-primary-200 bg-primary-50/50 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <span className="pb-2 font-mono text-sm font-medium text-gray-800">
          {slotCode}
        </span>
        <label className="w-28 text-xs text-gray-600">
          Slot price $
          <input
            className={inputClass}
            value={price}
            onChange={(e) =>
              onRowsChange((rows) =>
                withSlotPrice(rows, { slotCode, price: e.target.value }),
              )
            }
          />
        </label>
      </div>

      {entries.map((entry, index) => (
        <div
          // Position is the identity here: a blank entry has no product yet.
          key={index}
          className="flex flex-wrap items-end gap-2"
        >
          <span className="w-12 pb-2 text-xs text-muted">
            {slotPositionLabel({ index, count: entries.length })}
          </span>
          <div className="min-w-48 flex-1 text-xs text-gray-600">
            Product
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
          </div>
          <label className="w-20 text-xs text-gray-600">
            Par
            <input
              className={inputClass}
              value={entry.par}
              onChange={(e) =>
                onRowsChange((rows) =>
                  withEntryPatched(
                    rows,
                    { slotCode, index },
                    { par: e.target.value },
                  ),
                )
              }
            />
          </label>
          {entries.length > 1 ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={index === 0}
                onClick={() =>
                  onRowsChange((rows) =>
                    withEntryMoved(rows, { slotCode, index, offset: -1 }),
                  )
                }
              >
                ↑
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={index === entries.length - 1}
                onClick={() =>
                  onRowsChange((rows) =>
                    withEntryMoved(rows, { slotCode, index, offset: 1 }),
                  )
                }
              >
                ↓
              </Button>
            </>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onRowsChange((rows) =>
                withEntryRemoved(rows, { slotCode, index }),
              )
            }
          >
            {entries.length > 1 ? "Remove" : "Clear"}
          </Button>
        </div>
      ))}

      <div className="flex justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canAddBehind}
          onClick={() => onRowsChange((rows) => withEntryAdded(rows, slotCode))}
        >
          + Add product behind
        </Button>
        <Button size="sm" onClick={onNext}>
          Next slot →
        </Button>
      </div>
    </div>
  );
}

/** A mixed slot lists several entries but counts as one slot. */
const assignedSlotCount = (slots: { slotCode: string }[]): number =>
  new Set(slots.map((slot) => slot.slotCode)).size;
