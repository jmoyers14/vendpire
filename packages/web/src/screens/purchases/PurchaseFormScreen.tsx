import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ApiCandidate, ApiProduct } from "../../apiTypes.ts";
import { queryClient, trpc, trpcClient } from "../../trpc.ts";
import {
  Button,
  DeleteSection,
  ErrorNote,
  eyebrowLinkClass,
  Field,
  FormSection,
  MoneyInput,
  Page,
  PageHeader,
  pageLinkClass,
  RowTable,
  RowTableBody,
  RowTableEmpty,
  RowTableFooter,
  RowTableHeader,
  SaveBar,
  TextArea,
  TextInput,
  useFormDraft,
} from "../../ui.tsx";
import { dateInputFor, formatShortDate, middayInstantFor } from "../../utils/dates.ts";
import { centsToInput, formatCents } from "../../utils/money.ts";
import { plural } from "../../utils/text.ts";
import {
  BarcodeNotFoundPanel,
  type CreatedForPurchase,
  isCreatedUnit,
} from "./BarcodeNotFoundPanel.tsx";
import { buildCatalogItems, type CatalogItem, isUnitItem } from "./catalogSearch.ts";
import {
  type PackOption,
  type ProductOption,
  PURCHASE_ROW_COLUMNS,
  PurchaseLineRow,
} from "./PurchaseLineRow.tsx";
import { previewPackSplit } from "./packSplit.ts";
import { ReceiptCheckLine } from "./ReceiptCheckLine.tsx";
import {
  buildPurchaseLines,
  differenceLabelFor,
  isPackRow,
  isRowComplete,
  newPackRow,
  newUnitRow,
  type Row,
  receiptCheckFor,
  rowsSummaryFor,
  toUnitRow,
} from "./rows.ts";
import { ScanOrSearchInput } from "./ScanOrSearchInput.tsx";

/**
 * A scanned code with nothing behind it yet. Held until the setup panel either
 * attaches it to an existing record or creates the one it belongs to.
 */
interface PendingCode {
  gtin14: string;
  /** What an outside catalog guessed, when it recognised the code. */
  candidate: ApiCandidate | null;
  /** A case-level code, so the panel opens on "a case". */
  likelyCase: boolean;
}

interface PurchaseDraft {
  date: string;
  vendor: string;
  notes: string;
  receiptTotal: string;
  rows: Row[];
}

/** Most runs are a Costco trip. Only a starting point — the field is editable. */
const DEFAULT_VENDOR = "Costco";

const toProductOption = (product: ApiProduct): ProductOption => ({
  id: product.id,
  name: product.name,
});

/** Create + edit form: `purchaseId` present means edit. */
export function PurchaseFormScreen({ purchaseId }: { purchaseId?: string }) {
  const navigate = useNavigate();
  const isEditing = Boolean(purchaseId);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  /**
   * Minted once when the form opens, not at submit time. A lazy initializer is
   * what makes it survive re-renders, so double-clicking Save sends the SAME
   * key twice and the server returns the first purchase instead of writing a
   * second one.
   */
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const { draft, set, load, discard, isDirty } = useFormDraft<PurchaseDraft>({
    date: dateInputFor(new Date()),
    vendor: DEFAULT_VENDOR,
    notes: "",
    receiptTotal: "",
    rows: [],
  });
  // Loaded once: a refetch on window focus must not wipe lines being entered.
  const [hasLoaded, setHasLoaded] = useState(false);

  const [isResolving, setIsResolving] = useState(false);
  const [pendingCode, setPendingCode] = useState<PendingCode | null>(null);
  // Records created mid-entry, so their rows can name them before the list
  // query refetches.
  const [extraProducts, setExtraProducts] = useState<ProductOption[]>([]);
  const [extraPacks, setExtraPacks] = useState<PackOption[]>([]);

  const products = useQuery(trpc.products.list.queryOptions());
  const packs = useQuery(trpc.packs.list.queryOptions());
  const existing = useQuery({
    ...trpc.purchases.get.queryOptions({ id: purchaseId ?? "" }),
    enabled: isEditing,
  });

  const loadedProducts = products.data ?? [];
  const loadedPacks = packs.data ?? [];

  // Anything created mid-entry that the list query hasn't caught up with yet.
  const unlistedProducts = extraProducts.filter(
    (extra) => !loadedProducts.some((product) => product.id === extra.id),
  );
  const unlistedPacks = extraPacks.filter(
    (extra) => !loadedPacks.some((pack) => pack.id === extra.id),
  );
  const productOptions = [...loadedProducts.map(toProductOption), ...unlistedProducts];
  const packOptions: PackOption[] = [...loadedPacks, ...unlistedPacks];

  // Stored purchases hold expanded per-product lines — pack lines were already
  // expanded away at save time, so editing shows the unit lines (the facts).
  useEffect(() => {
    const purchase = existing.data;
    if (!purchase || hasLoaded) {
      return;
    }
    setHasLoaded(true);
    load({
      date: dateInputFor(purchase.purchasedAt),
      vendor: purchase.vendor,
      notes: purchase.notes ?? "",
      receiptTotal:
        purchase.receiptTotalCents !== null ? centsToInput(purchase.receiptTotalCents) : "",
      rows: purchase.lines.map(toUnitRow),
    });
  }, [existing.data, hasLoaded, load]);

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [error]);

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: trpc.purchases.list.pathKey() });
    navigate({ to: "/purchases" });
  };
  const saveCallbacks = {
    onSuccess: handleSaved,
    onError: (mutationError: { message: string }) => setError(mutationError.message),
  };
  const create = useMutation(trpc.purchases.create.mutationOptions(saveCallbacks));
  const update = useMutation(trpc.purchases.update.mutationOptions(saveCallbacks));

  // Searchable catalog, built from the live lists. A record created mid-entry
  // is added as a row immediately, so it needn't be searchable before refetch.
  const catalogItems = buildCatalogItems(loadedProducts, loadedPacks);

  // Functional, so a row added after an await lands on the latest rows.
  const addRow = (row: Row) => set((current) => ({ rows: [...current.rows, row] }));
  const changeRow = (index: number, patch: Partial<Row>) =>
    set((current) => ({
      rows: current.rows.map((row, i) => (i === index ? ({ ...row, ...patch } as Row) : row)),
    }));
  const removeRow = (index: number) =>
    set((current) => ({ rows: current.rows.filter((_, i) => i !== index) }));

  /**
   * Resolve a scanned code into a row, or open the not-found panel. Returns
   * false to leave the text in the box so a mistyped digit can be fixed.
   */
  const resolveBarcode = async (raw: string): Promise<boolean> => {
    setScanError(null);
    setIsResolving(true);
    try {
      const result = await trpcClient.barcodes.resolve.query({ code: raw });
      if (result.status === "product") {
        addRow(newUnitRow(result.product.id));
        return true;
      }
      if (result.status === "pack") {
        addRow(newPackRow(result.pack.id));
        return true;
      }
      if (result.status === "invalid") {
        setScanError(`"${raw}" isn't a valid barcode. Check the digits.`);
        return false;
      }
      setPendingCode({
        gtin14: result.gtin14,
        candidate: result.status === "candidate" ? result.item : null,
        likelyCase: result.likelyCase,
      });
      return true;
    } catch (lookupError) {
      setScanError(lookupError instanceof Error ? lookupError.message : "Lookup failed");
      return false;
    } finally {
      setIsResolving(false);
    }
  };

  /** A result picked by name — the same row a scan of it would have added. */
  const addFromCatalog = (item: CatalogItem) => {
    setScanError(null);
    addRow(isUnitItem(item) ? newUnitRow(item.id) : newPackRow(item.id));
  };

  const handleSetupReady = (created: CreatedForPurchase) => {
    if (isCreatedUnit(created)) {
      setExtraProducts((current) => [...current, { id: created.id, name: created.label }]);
      addRow(newUnitRow(created.id));
    } else {
      setExtraPacks((current) => [
        ...current,
        { id: created.id, name: created.label, contents: created.contents },
      ]);
      addRow(newPackRow(created.id));
    }
    setPendingCode(null);
  };

  const { rows } = draft;
  const summary = rowsSummaryFor(rows);
  const receiptCheck = receiptCheckFor({
    itemsCents: summary.totalCents,
    receiptTotal: draft.receiptTotal,
  });
  const isVendorMissing = draft.vendor.trim() === "";
  const canSave = rows.length > 0 && summary.incompleteCount === 0 && !isVendorMissing;

  // Save's disabled state should prevent these; they stay as the last word.
  const handleSave = () => {
    setError(null);
    if (isVendorMissing) {
      setError("Vendor is required");
      return;
    }
    const built = buildPurchaseLines(rows);
    if (built.status === "invalid") {
      setError(built.message);
      return;
    }
    const { lines, packLines } = built;

    const data = {
      purchasedAt: middayInstantFor(draft.date),
      vendor: draft.vendor.trim(),
      lines,
      packLines,
      receiptTotalCents: receiptCheck.status === "none" ? null : receiptCheck.receiptCents,
      notes: draft.notes.trim() || null,
    };
    if (purchaseId) {
      // No key on an edit — it would strand the one the purchase was created
      // under. The router's input omits the field entirely.
      update.mutate({ id: purchaseId, ...data });
      return;
    }
    create.mutate({ ...data, clientRequestId });
  };

  const itemsText = plural(summary.rowCount, { one: "item", many: "items" });
  const savedPurchase = existing.data;
  // An edit is titled by the record itself: where and when.
  let title = "Log purchase";
  if (isEditing) {
    title = savedPurchase
      ? `${savedPurchase.vendor} · ${formatShortDate(savedPurchase.purchasedAt)}`
      : "…";
  }
  let saveSummary: ReactNode = isEditing ? undefined : "Nothing added yet";
  if (rows.length > 0) {
    // The running total against the receipt, so you can watch it close in while scanning.
    saveSummary = (
      <>
        {itemsText} ·{" "}
        <strong className="font-mono font-medium text-ink tabular-nums">
          {formatCents(summary.totalCents)}
        </strong>
        {receiptCheck.status === "none" ? null : (
          <>
            {" "}
            of{" "}
            <span className="font-mono tabular-nums">{formatCents(receiptCheck.receiptCents)}</span>
            {" · "}
            {receiptCheck.status === "matches" ? (
              <span className="font-bold text-success">✓ matches</span>
            ) : (
              <span className="font-bold text-warning">{differenceLabelFor(receiptCheck)}</span>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <>
      <Page max="form" className="grid gap-6">
        <PageHeader
          eyebrow={
            <>
              <Link to="/purchases" className={eyebrowLinkClass}>
                Purchases
              </Link>{" "}
              / {isEditing ? "Edit purchase" : "New"}
            </>
          }
          title={title}
          meta={
            isEditing
              ? undefined
              : "Record what you bought so restock costs and margins stay accurate."
          }
          aside={
            <Link to="/purchases" className={pageLinkClass}>
              ← Back to purchases
            </Link>
          }
        />

        <div>
          <FormSection
            title="Receipt"
            layout="stacked"
            description="Where and when you bought it, and its total to check the items against."
          >
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Date">
                <TextInput
                  type="date"
                  value={draft.date}
                  onChange={(event) => set({ date: event.target.value })}
                />
              </Field>
              <Field label="Vendor" error={isVendorMissing ? "Enter where you bought it" : undefined}>
                <TextInput
                  value={draft.vendor}
                  onChange={(event) => set({ vendor: event.target.value })}
                />
              </Field>
              <Field label="Receipt total" isOptional>
                <MoneyInput
                  placeholder="128.47"
                  value={draft.receiptTotal}
                  onChange={(event) => set({ receiptTotal: event.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="Items"
            layout="stacked"
            description="Scan or search each product. Use a pack when you bought a case and want the per-unit cost worked out."
          >
            <div className="grid gap-3">
              <ScanOrSearchInput
                items={catalogItems}
                isBusy={isResolving}
                error={scanError}
                onSubmitBarcode={resolveBarcode}
                onPick={addFromCatalog}
              />
              {pendingCode ? (
                <BarcodeNotFoundPanel
                  gtin14={pendingCode.gtin14}
                  candidate={pendingCode.candidate}
                  likelyCase={pendingCode.likelyCase}
                  products={loadedProducts}
                  packs={loadedPacks}
                  onReady={handleSetupReady}
                  onCancel={() => setPendingCode(null)}
                />
              ) : null}
              <div className="flex flex-wrap gap-5">
                <Button variant="text" onClick={() => addRow(newUnitRow(""))}>
                  + Item without a barcode
                </Button>
                <Button variant="text" onClick={() => addRow(newPackRow(""))}>
                  + Pack without a barcode
                </Button>
              </div>
            </div>

            <RowTable columns={PURCHASE_ROW_COLUMNS} minWidth="640px">
              <RowTableHeader>
                <span>Product</span>
                <span>Qty</span>
                <span className="text-right">Total paid</span>
                <span className="text-right">Per unit</span>
                <span />
              </RowTableHeader>
              {rows.length === 0 ? (
                <RowTableEmpty>No items yet. Scan or search above to add the first one.</RowTableEmpty>
              ) : (
                <RowTableBody>
                  {rows.map((row, index) => (
                    // Rows are positional and reorder by removal, so the index is the
                    // only stable key available.
                    <PurchaseLineRow
                      key={index}
                      row={row}
                      products={productOptions}
                      packs={packOptions}
                      split={
                        isPackRow(row)
                          ? previewPackSplit(
                              packOptions.find((pack) => pack.id === row.packId),
                              row.qty,
                              row.totalCost,
                            )
                          : null
                      }
                      // The newest row is the one being filled in; don't nag it.
                      isShowingMissing={index < rows.length - 1 && !isRowComplete(row)}
                      onChange={(patch) => changeRow(index, patch)}
                      onRemove={() => removeRow(index)}
                    />
                  ))}
                </RowTableBody>
              )}
              {rows.length === 0 ? null : (
                <RowTableFooter>
                  <span>
                    {itemsText}
                    {summary.incompleteCount > 0
                      ? ` · ${summary.incompleteCount} missing a product, qty or total`
                      : ""}
                  </span>
                  <span />
                  <span className="text-right font-mono tabular-nums">
                    {formatCents(summary.totalCents)}
                  </span>
                  <span />
                  <span />
                </RowTableFooter>
              )}
            </RowTable>
            <ReceiptCheckLine check={receiptCheck} />
          </FormSection>

          <FormSection
            title="Notes"
            layout="stacked"
            description="Anything worth remembering about this trip."
          >
            <Field label="Notes" isOptional>
              <TextArea
                rows={3}
                placeholder="e.g. Coke was on sale, stocked up for two weeks"
                value={draft.notes}
                onChange={(event) => set({ notes: event.target.value })}
              />
            </Field>
          </FormSection>
        </div>

        {/* Beside the save bar, since that's where Save was pressed. */}
        {error ? (
          <div ref={errorRef} className="scroll-mb-28">
            <ErrorNote message={error} />
          </div>
        ) : null}

        {purchaseId && savedPurchase ? (
          <DeletePurchaseSection purchaseId={purchaseId} purchaseName={title} />
        ) : null}
      </Page>
      <SaveBar
        isDirty={isDirty}
        summary={saveSummary}
        saveLabel={isEditing ? "Save changes" : "Save purchase"}
        dismissal={isEditing ? "discard" : "cancel"}
        onDismiss={() => {
          if (isEditing) {
            discard();
            return;
          }
          navigate({ to: "/purchases" });
        }}
        onSave={handleSave}
        isSaving={create.isPending || update.isPending}
        isSaveDisabled={!canSave}
      />
    </>
  );
}

/** Every visit's cost of goods since is worked out again without it. */
function DeletePurchaseSection({
  purchaseId,
  purchaseName,
}: {
  purchaseId: string;
  purchaseName: string;
}) {
  const navigate = useNavigate();
  const remove = useMutation(
    trpc.purchases.remove.mutationOptions({
      onSuccess: () => {
        // pathKey(), not queryKey(): the list is stored under an INFINITE key.
        queryClient.invalidateQueries({ queryKey: trpc.purchases.list.pathKey() });
        navigate({ to: "/purchases" });
      },
    }),
  );
  return (
    <DeleteSection
      recordKind="purchase"
      recordName={purchaseName}
      description="Its items come out of your costs, so profit on every visit since is worked out again without them."
      isDeleting={remove.isPending}
      error={remove.error?.message ?? null}
      onDelete={() => remove.mutate({ id: purchaseId })}
      onDismiss={() => remove.reset()}
    />
  );
}
