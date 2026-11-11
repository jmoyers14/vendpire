import { slotProductKey } from "@vendpire/domain";
import { useMemo, useState } from "react";
import {
  Button,
  ChipGroup,
  Field,
  insetFocusRing,
  NumberInput,
  RowTable,
  RowTableBody,
  RowTableHeader,
  RowTableRow,
  Switch,
  TextInput,
} from "../../ui.tsx";
import { onEnterKey } from "../../utils/keyboard.ts";
import { rankByName } from "../../utils/textMatch.ts";
import type { ProductOption } from "../machines/ProductCombobox.tsx";
import {
  type Arrival,
  arrivalsIn,
  type PullReason,
  type Restock,
  restockWithAction,
  restockWithArrivalChange,
  restockWithSourceLinked,
  suggestedSourcesFor,
} from "./restock.ts";
import { nowLevelFor, stayingRowsIn } from "./restockSlots.ts";
import { EditorInset } from "./SlotEditor.tsx";
import { REMOVAL_LABELS } from "./visitActivity.ts";
import {
  leftAfterPull,
  parseCount,
  rowWithRemoved,
  rowWithRemovedReason,
  type VisitRow,
} from "./visitRows.ts";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const PULL_REASONS: { value: PullReason; label: string }[] = (
  ["expired", "damaged", "recalled", "destocked"] as const
).map((value) => ({ value, label: capitalize(REMOVAL_LABELS[value]) }));

type AddEntry =
  | { kind: "row"; key: string; row: VisitRow }
  | { kind: "arrival"; key: string; arrival: Arrival };

interface AddDraft {
  wentIn: string;
  bestBy: string;
}

const draftFor = (entry: AddEntry, restock: Restock): AddDraft => {
  if (entry.kind === "arrival") {
    return { wentIn: entry.arrival.added, bestBy: entry.arrival.bestBy };
  }
  const action = restock.actions[entry.key];
  return { wentIn: action?.kind === "added" ? action.added : "", bestBy: "" };
};

const productIdOf = (entry: AddEntry) =>
  entry.kind === "row" ? entry.row.productId : entry.arrival.productId;

/**
 * "Went in" for every product staying in the slot and every arrival, with the
 * level it leaves the slot at. Blank is never 0, so Save waits for a number
 * in every row.
 */
export function AddStockPanel({
  slotCode,
  rows,
  restock,
  nameOf,
  onRestockChange,
  onDone,
}: {
  slotCode: string;
  rows: readonly VisitRow[];
  restock: Restock;
  nameOf: (productId: string) => string;
  onRestockChange: (next: Restock) => void;
  onDone: () => void;
}) {
  const entries: AddEntry[] = [
    ...stayingRowsIn({ rows, restock, slotCode }).map((row) => ({
      kind: "row" as const,
      key: slotProductKey(row),
      row,
    })),
    ...arrivalsIn(restock, slotCode).map((arrival) => ({
      kind: "arrival" as const,
      key: slotProductKey(arrival),
      arrival,
    })),
  ];
  const [drafts, setDrafts] = useState<Record<string, AddDraft>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.key, draftFor(entry, restock)])),
  );
  const draftOf = (key: string): AddDraft => drafts[key] ?? { wentIn: "", bestBy: "" };
  const updateDraft = (key: string, patch: Partial<AddDraft>) =>
    setDrafts({ ...drafts, [key]: { ...draftOf(key), ...patch } });

  const hasDates = entries.some(
    (entry) => entry.kind === "arrival" && entry.arrival.tracksExpiration,
  );
  const isComplete = entries.every((entry) => parseCount(draftOf(entry.key).wentIn) !== null);

  const handleSave = () => {
    if (!isComplete) {
      return;
    }
    const next = entries.reduce((current, entry) => {
      const { wentIn, bestBy } = draftOf(entry.key);
      if (entry.kind === "row") {
        return restockWithAction(current, entry.row, { kind: "added", added: wentIn });
      }
      return restockWithArrivalChange(current, entry.arrival, { added: wentIn, bestBy });
    }, restock);
    onRestockChange(next);
    onDone();
  };

  return (
    <EditorInset title="Add stock" onCancel={onDone}>
      <RowTable
        columns={`minmax(0,1fr) 140px 120px${hasDates ? " 168px" : ""}`}
        variant="plain"
        minWidth="440px"
      >
        <RowTableHeader>
          <span>Product</span>
          <span>Went in</span>
          <span>After</span>
          {hasDates ? <span>Best by</span> : null}
        </RowTableHeader>
        <RowTableBody>
          {entries.map((entry, index) => {
            const name = nameOf(productIdOf(entry));
            const draft = draftOf(entry.key);
            const after =
              entry.kind === "row"
                ? nowLevelFor(entry.row, draft.wentIn)
                : parseCount(draft.wentIn);
            const par = entry.kind === "row" ? entry.row.par : null;
            return (
              <RowTableRow key={entry.key}>
                <div className="grid min-w-0 gap-1">
                  <span className="text-body font-bold text-ink">{name}</span>
                  <AddEntryNote
                    entry={entry}
                    rows={rows}
                    restock={restock}
                    onRestockChange={onRestockChange}
                  />
                </div>
                <NumberInput
                  size="lg"
                  autoFocus={index === 0}
                  aria-label={`Went in, ${name}`}
                  placeholder="0"
                  value={draft.wentIn}
                  onChange={(event) => updateDraft(entry.key, { wentIn: event.target.value })}
                  onKeyDown={onEnterKey(handleSave)}
                />
                <span className="font-display text-xl font-bold text-ink tabular-nums">
                  {after ?? "—"}
                  {par === null ? null : (
                    <span className="text-body font-normal text-muted-strong"> / {par}</span>
                  )}
                </span>
                {hasDates ? (
                  <BestByCell
                    entry={entry}
                    name={name}
                    value={draft.bestBy}
                    onChange={(bestBy) => updateDraft(entry.key, { bestBy })}
                  />
                ) : null}
              </RowTableRow>
            );
          })}
        </RowTableBody>
      </RowTable>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={handleSave} disabled={!isComplete}>
          Save
        </Button>
        <span className="text-body-sm text-muted-strong">
          {isComplete ? "Enter saves" : "Enter 0 for anything that got none"}
        </span>
      </div>
    </EditorInset>
  );
}

/** Only an arrival that tracks expiration takes a date here; Count recorded the rest. */
function BestByCell({
  entry,
  name,
  value,
  onChange,
}: {
  entry: AddEntry;
  name: string;
  value: string;
  onChange: (bestBy: string) => void;
}) {
  if (entry.kind !== "arrival" || !entry.arrival.tracksExpiration) {
    return <span />;
  }
  return (
    <TextInput
      type="date"
      className="h-14"
      aria-label={`Best by, ${name}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** Under a product's name: how much is in the slot now, or where an arrival came from. */
function AddEntryNote({
  entry,
  rows,
  restock,
  onRestockChange,
}: {
  entry: AddEntry;
  rows: readonly VisitRow[];
  restock: Restock;
  onRestockChange: (next: Restock) => void;
}) {
  if (entry.kind === "row") {
    return (
      <span className="text-body-sm text-muted-strong">
        {leftAfterPull(entry.row) ?? "—"} in slot now
      </span>
    );
  }
  const { arrival } = entry;
  if (arrival.fromSlotCode !== null) {
    return <span className="text-body-sm text-muted-strong">From {arrival.fromSlotCode}</span>;
  }
  const sources = suggestedSourcesFor(restock, rows, arrival);
  return (
    <span className="flex flex-wrap items-center gap-2 text-body-sm text-muted-strong">
      New in this slot
      {sources.map((source) => (
        <Button
          key={source.slotCode}
          variant="text"
          size="sm"
          onClick={() => onRestockChange(restockWithSourceLinked(restock, { arrival, source }))}
        >
          Came from {source.slotCode}?
        </Button>
      ))}
    </span>
  );
}

/**
 * Units pulled out of the slot. Off, the product stays and still gets an Add
 * stock or Nothing changed answer; "Take it out of this slot" on, it leaves
 * the planogram with everything found.
 */
export function PullPanel({
  pullableRows,
  restock,
  nameOf,
  onRowChange,
  onRestockChange,
  onDone,
}: {
  /** Counted products still in the slot. */
  pullableRows: VisitRow[];
  restock: Restock;
  nameOf: (productId: string) => string;
  onRowChange: (next: VisitRow) => void;
  onRestockChange: (next: Restock) => void;
  onDone: () => void;
}) {
  const [productId, setProductId] = useState<string | null>(
    pullableRows.length === 1 ? (pullableRows[0]?.productId ?? null) : null,
  );
  const row = pullableRows.find((candidate) => candidate.productId === productId);
  const [reason, setReason] = useState<PullReason | null>(null);
  const [quantity, setQuantity] = useState("");
  const [isTakingOut, setIsTakingOut] = useState(false);

  const found = row ? parseCount(row.left) : null;
  const parsedQuantity = parseCount(quantity);
  const isQuantityValid =
    parsedQuantity !== null && parsedQuantity >= 1 && found !== null && parsedQuantity <= found;
  const canLog = row !== undefined && reason !== null && (isTakingOut || isQuantityValid);

  const handleLog = () => {
    if (!row || reason === null || !canLog) {
      return;
    }
    if (isTakingOut) {
      // Everything found leaves with the product, so no separate pull.
      onRowChange(rowWithRemovedReason(rowWithRemoved(row, ""), null));
      onRestockChange(restockWithAction(restock, row, { kind: "pulled", reason }));
    } else {
      onRowChange(rowWithRemovedReason(rowWithRemoved(row, quantity), reason));
    }
    onDone();
  };

  return (
    <EditorInset title="Pull from slot" onCancel={onDone}>
      {pullableRows.length > 1 ? (
        <div className="grid gap-2">
          <span className="text-label text-ink">Which product?</span>
          <ChipGroup
            label="Which product?"
            options={pullableRows.map((candidate) => ({
              value: candidate.productId,
              label: nameOf(candidate.productId),
            }))}
            value={productId}
            onChange={setProductId}
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <span className="text-label text-ink">Why?</span>
        <ChipGroup label="Why?" options={PULL_REASONS} value={reason} onChange={setReason} />
      </div>
      <div className="max-w-[200px]">
        <Field label="How many?" hint={found === null ? undefined : `${found} found in the slot`}>
          <NumberInput
            value={isTakingOut ? String(found ?? "") : quantity}
            disabled={isTakingOut}
            placeholder="1"
            onChange={(event) => setQuantity(event.target.value)}
            onKeyDown={onEnterKey(handleLog)}
          />
        </Field>
      </div>
      <Switch
        title="Take it out of this slot"
        description="For a product leaving the planogram. Everything found goes out with it."
        isChecked={isTakingOut}
        onChange={setIsTakingOut}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={handleLog} disabled={!canLog}>
          Log pull
        </Button>
        {reason === null ? (
          <span className="text-body-sm text-muted-strong">Pick a reason first</span>
        ) : null}
      </div>
    </EditorInset>
  );
}

const RESULT_LIMIT = 6;

/** Search the catalogue and load a product into the slot as new stock. */
export function LoadProductPanel({
  slotCode,
  products,
  onLoad,
  onCancel,
}: {
  slotCode: string;
  /** Already narrowed to the products this slot can take. */
  products: ProductOption[];
  onLoad: (product: ProductOption) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const alphabetical = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  const results =
    query.trim() === ""
      ? alphabetical.slice(0, RESULT_LIMIT)
      : rankByName(products, query, RESULT_LIMIT);

  return (
    <EditorInset title={`Load a product into ${slotCode}`} onCancel={onCancel}>
      <Field label="Product">
        <TextInput
          type="search"
          autoFocus
          autoComplete="off"
          placeholder="e.g. Twix"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Field>
      {results.length === 0 ? (
        <p className="text-body-sm text-muted-strong">No products match.</p>
      ) : (
        <ul className="divide-y divide-divider overflow-hidden rounded-control border border-line bg-card">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onLoad(product)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-body text-ink hover:bg-action-soft ${insetFocusRing}`}
              >
                <span className="truncate">{product.name}</span>
                <span className="flex-none text-label text-link">Load into {slotCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </EditorInset>
  );
}
