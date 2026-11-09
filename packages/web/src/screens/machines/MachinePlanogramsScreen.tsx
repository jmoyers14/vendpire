import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  ErrorNote,
  inputClass,
  Page,
  PageTitle,
  type SlotCell,
  SlotFaceGrid,
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
  slotEntries,
  stockLeftOut,
  usePlanogramDraft,
  withEntryMoved,
  withEntryPatched,
  withEntryRemoved,
  withProductAdded,
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
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.productId) {
        continue;
      }
      const pair = `${row.slotCode}\u0000${row.productId}`;
      if (seen.has(pair)) {
        setError(
          `Slot ${row.slotCode}: ${productName(row.productId)} is listed twice`,
        );
        return;
      }
      seen.add(pair);
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
              const entries = slotEntries(rows, slotCode).filter(
                (entry) => entry.productId,
              );
              const [front] = entries;
              return slotCell({
                slotCode,
                names: entries.map((entry) => productName(entry.productId)),
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
              entries={slotEntries(rows, selected)}
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
                  (s) => s.slotCode === slotCode,
                );
                const [front] = entries;
                return slotCell({
                  slotCode,
                  names: entries.map((s) => productName(s.productId)),
                  detail: front
                    ? `${formatCents(front.priceCents)} · par ${front.par}`
                    : null,
                  emptyLabel: "—",
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

/**
 * A face cell: the slot code, then every product front to back, with a count
 * badge when the slot is mixed.
 */
function slotCell({
  slotCode,
  names,
  detail,
  emptyLabel,
}: {
  slotCode: string;
  names: string[];
  detail: string | null;
  emptyLabel: string;
}): SlotCell {
  if (names.length === 0) {
    return {
      state: "empty",
      title: `${slotCode}: empty`,
      content: (
        <>
          <div className="font-mono text-[10px] text-muted">{slotCode}</div>
          <div className="text-[10px] text-gray-400">{emptyLabel}</div>
        </>
      ),
    };
  }
  return {
    state: "assigned",
    title: `${slotCode}: ${names.join(", then ")}${detail ? ` — ${detail}` : ""}`,
    content: (
      <>
        <div className="font-mono text-[10px] text-muted">
          {slotCode}
          {names.length > 1 ? (
            <span className="ml-1 rounded bg-primary-50 px-1 text-primary-700">
              {names.length}
            </span>
          ) : null}
        </div>
        {names.map((name, index) => (
          <div
            // A product appears once per slot, so its name is a stable key.
            key={name}
            className={`truncate text-xs ${
              index === 0 ? "font-medium text-gray-800" : "text-gray-600"
            }`}
          >
            {name}
          </div>
        ))}
        {detail ? <div className="text-[10px] text-gray-600">{detail}</div> : null}
      </>
    ),
  };
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
 * Edits one slot of the in-progress version: its one price, then each product
 * front to back. Picking the product for a single-product slot fills the price
 * from the product's default; in a mixed slot the slot's price stands, since
 * the machine charges per slot. "Next slot" walks the machine in slot order so
 * a full setup needs no extra clicks on the grid.
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
              onRowsChange((rows) => withSlotPrice(rows, slotCode, e.target.value))
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
            {entries.length > 1 ? (index === 0 ? "Front" : "Behind") : ""}
          </span>
          <div className="min-w-48 flex-1 text-xs text-gray-600">
            Product
            <ProductCombobox
              products={products}
              productId={entry.productId}
              onPick={(product) =>
                onRowsChange((rows) => {
                  const picked = withEntryPatched(rows, slotCode, index, {
                    productId: product.id,
                    par: entry.par || "10",
                  });
                  return entries.length === 1
                    ? withSlotPrice(
                        picked,
                        slotCode,
                        centsToInput(product.defaultPriceCents),
                      )
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
                  withEntryPatched(rows, slotCode, index, { par: e.target.value }),
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
                  onRowsChange((rows) => withEntryMoved(rows, slotCode, index, -1))
                }
              >
                ↑
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={index === entries.length - 1}
                onClick={() =>
                  onRowsChange((rows) => withEntryMoved(rows, slotCode, index, 1))
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
              onRowsChange((rows) => withEntryRemoved(rows, slotCode, index))
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
          onClick={() => onRowsChange((rows) => withProductAdded(rows, slotCode))}
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

/** Distinct slots with a product. A mixed slot lists several entries but is one slot. */
const assignedSlotCount = (slots: { slotCode: string }[]): number =>
  new Set(slots.map((slot) => slot.slotCode)).size;
