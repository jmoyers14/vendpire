import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Button,
  ErrorNote,
  inputClass,
  Page,
  PageTitle,
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
  usePlanogramDraft,
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
              const row = rows.find((r) => r.slotCode === slotCode);
              return {
                state: row?.productId ? "assigned" : "empty",
                content: (
                  <>
                    <div className="font-mono text-[10px] text-muted">
                      {slotCode}
                    </div>
                    {row?.productId ? (
                      <>
                        <div className="truncate text-xs font-medium text-gray-800">
                          {productName(row.productId)}
                        </div>
                        <div className="text-[10px] text-gray-600">
                          {row.price ? `$${row.price}` : "—"} · par{" "}
                          {row.par || "—"}
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-gray-400">empty</div>
                    )}
                  </>
                ),
              };
            }}
          />

          {/* Edit panel for the selected slot. */}
          {selected ? (
            <SlotEditPanel
              key={selected}
              slotCode={selected}
              row={rows.find((r) => r.slotCode === selected)}
              products={products.data ?? []}
              onChange={(patch) =>
                updateRows(
                  rows.map((r) =>
                    r.slotCode === selected ? { ...r, ...patch } : r,
                  ),
                )
              }
              onNext={() => {
                const order = machine.data?.slots.flat() ?? [];
                const index = order.indexOf(selected);
                setSelected(order[(index + 1) % order.length] ?? null);
              }}
            />
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
                ? `Current since ${new Date(current.effectiveFrom).toLocaleDateString()} · ${current.slots.length} slot(s) assigned`
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
                const slot = current.slots.find((s) => s.slotCode === slotCode);
                return {
                  state: slot ? "assigned" : "empty",
                  title: slot
                    ? `${slotCode}: ${productName(slot.productId)} — par ${slot.par} @ ${formatCents(slot.priceCents)}`
                    : `${slotCode}: empty`,
                  content: (
                    <>
                      <div className="font-mono text-[10px] text-muted">
                        {slotCode}
                      </div>
                      {slot ? (
                        <>
                          <div className="truncate text-xs font-medium text-gray-800">
                            {productName(slot.productId)}
                          </div>
                          <div className="text-[10px] text-gray-600">
                            {formatCents(slot.priceCents)} · par {slot.par}
                          </div>
                        </>
                      ) : (
                        <div className="text-[10px] text-gray-400">—</div>
                      )}
                    </>
                  ),
                };
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
                    {version.slots.length} slot(s)
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
  row: DraftSlot | undefined;
  products: ProductOption[];
  onChange: (patch: Partial<DraftSlot>) => void;
  onNext: () => void;
}

/**
 * Edits one slot of the in-progress planogram version. Picking a product
 * auto-fills the price from its default (still editable) and defaults par to
 * the previous value or 10. "Next slot" walks the machine in slot order so a
 * full setup needs no extra clicks on the grid.
 */
function SlotEditPanel({
  slotCode,
  row,
  products,
  onChange,
  onNext,
}: SlotEditPanelProps) {
  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-primary-200 bg-primary-50/50 p-3">
      <span className="pb-2 font-mono text-sm font-medium text-gray-800">
        {slotCode}
      </span>
      <div className="min-w-48 flex-1 text-xs text-gray-600">
        Product
        <ProductCombobox
          products={products}
          productId={row?.productId ?? ""}
          onPick={(product) =>
            onChange({
              productId: product.id,
              price: centsToInput(product.defaultPriceCents),
              par: row?.par || "10",
            })
          }
        />
      </div>
      <label className="w-20 text-xs text-gray-600">
        Par
        <input
          className={inputClass}
          value={row?.par ?? ""}
          onChange={(e) => onChange({ par: e.target.value })}
        />
      </label>
      <label className="w-24 text-xs text-gray-600">
        Price $
        <input
          className={inputClass}
          value={row?.price ?? ""}
          onChange={(e) => onChange({ price: e.target.value })}
        />
      </label>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange({ productId: "", par: "", price: "" })}
      >
        Clear
      </Button>
      <Button
        size="sm"
        onClick={onNext}
      >
        Next slot →
      </Button>
    </div>
  );
}
