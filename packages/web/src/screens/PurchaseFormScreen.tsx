import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { allocateProportionally } from "@vendpire/domain";
import { useEffect, useState } from "react";
import {
  BarcodeNotFoundPanel,
  type CatalogCandidate,
  type CreatedForPurchase,
  isCreatedUnit,
} from "../components/BarcodeNotFoundPanel.tsx";
import { ScanOrSearchInput } from "../components/ScanOrSearchInput.tsx";
import type { ApiPack, ApiProduct, ApiPurchase } from "../lib/apiTypes.ts";
import {
  type CatalogItem,
  buildCatalogItems,
  isUnitItem,
} from "../lib/catalogSearch.ts";
import {
  Button,
  ErrorNote,
  inputClass,
  Page,
  PageTitle,
} from "../components/ui.tsx";
import { centsToInput, formatCents, parseDollarsToCents } from "../lib/money.ts";
import { queryClient, trpc, trpcClient } from "../trpc.ts";

/**
 * One line of the purchase being entered. A row is either a pack (N packs for
 * one total, expanded server-side) or loose units of a single product —
 * whichever the scanned barcode turned out to be.
 */
export interface PackRow {
  kind: "pack";
  packId: string;
  qty: string;
  totalCost: string;
}

export interface UnitRow {
  kind: "unit";
  productId: string;
  units: string;
  totalCost: string;
  /** Provenance preserved when editing an existing purchase. */
  packId: string | null;
}

type Row = PackRow | UnitRow;

const isPackRow = (row: Row): row is PackRow => row.kind === "pack";

/**
 * What a <select> needs of each record — the lists also hold entries created
 * mid-entry, which have no server round trip behind them yet.
 */
type ProductOption = Pick<ApiProduct, "id" | "name">;
type PackOption = Pick<ApiPack, "id" | "name" | "contents">;

/**
 * A scanned code with nothing behind it yet. Held until the setup panel either
 * attaches it to an existing record or creates the one it belongs to.
 */
interface PendingCode {
  gtin14: string;
  /** What an outside catalog guessed, when it recognised the code. */
  candidate: CatalogCandidate | null;
  /** A case-level code, so the panel opens on "a case". */
  likelyCase: boolean;
}

/** Length of the `YYYY-MM-DD` prefix an <input type="date"> expects. */
const ISO_DATE_LENGTH = 10;

/** Most runs are a Costco trip. Only a starting point — the field is editable. */
const DEFAULT_VENDOR = "Costco";

/**
 * Midday rather than midnight: the date input gives a bare calendar day, and
 * anchoring it at noon keeps the stored instant on that same day across every
 * US timezone instead of slipping a day either side of UTC.
 */
const MIDDAY_SUFFIX = "T12:00:00";

/** A scanned or picked case is one case until the operator says otherwise. */
const DEFAULT_PACK_QTY = "1";

const toDateInput = (iso: string): string => iso.slice(0, ISO_DATE_LENGTH);

/** A stored line, reopened for editing. Stored lines are always per-product. */
const toUnitRow = (line: ApiPurchase["lines"][number]): UnitRow => ({
  kind: "unit",
  productId: line.productId,
  units: String(line.units),
  totalCost: centsToInput(line.totalCostCents),
  packId: line.packId,
});

/** A blank row for a product — cost and count are filled in from the receipt. */
const newUnitRow = (productId: string): UnitRow => ({
  kind: "unit",
  productId,
  units: "",
  totalCost: "",
  packId: null,
});

/** A blank row for a case. One case until the operator says otherwise. */
const newPackRow = (packId: string): PackRow => ({
  kind: "pack",
  packId,
  qty: DEFAULT_PACK_QTY,
  totalCost: "",
});

const toProductOption = (product: ApiProduct): ProductOption => ({
  id: product.id,
  name: product.name,
});

/** Create + edit form: `purchaseId` present means edit. */
export function PurchaseFormScreen({ purchaseId }: { purchaseId?: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [vendor, setVendor] = useState(DEFAULT_VENDOR);
  const [notes, setNotes] = useState("");
  const [receiptTotal, setReceiptTotal] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  const [resolving, setResolving] = useState(false);
  const [pendingCode, setPendingCode] = useState<PendingCode | null>(null);
  // Records created mid-entry, so their <option> exists before the list query
  // refetches.
  const [extraProducts, setExtraProducts] = useState<ProductOption[]>([]);
  const [extraPacks, setExtraPacks] = useState<PackOption[]>([]);

  const products = useQuery(trpc.products.list.queryOptions());
  const packs = useQuery(trpc.packs.list.queryOptions());
  const existing = useQuery({
    ...trpc.purchases.get.queryOptions({ id: purchaseId ?? "" }),
    enabled: Boolean(purchaseId),
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

  const listedProductOptions = loadedProducts.map(toProductOption);
  const productOptions = [...listedProductOptions, ...unlistedProducts];
  const packOptions: PackOption[] = [...loadedPacks, ...unlistedPacks];

  // Stored purchases hold expanded per-product lines — pack lines were already
  // expanded away at save time, so editing shows the unit lines (the facts).
  useEffect(() => {
    const purchase = existing.data;
    if (!purchase) {
      return;
    }
    setDate(toDateInput(purchase.purchasedAt));
    setVendor(purchase.vendor);
    setNotes(purchase.notes ?? "");
    setReceiptTotal(
      purchase.receiptTotalCents !== null
        ? centsToInput(purchase.receiptTotalCents)
        : "",
    );
    setRows(purchase.lines.map(toUnitRow));
  }, [existing.data]);

  const onSaved = () => {
    queryClient.invalidateQueries({ queryKey: trpc.purchases.list.queryKey() });
    navigate({ to: "/purchases" });
  };
  const create = useMutation(
    trpc.purchases.create.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );
  const update = useMutation(
    trpc.purchases.update.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );

  // Searchable catalog, built from the live lists. A record created mid-entry
  // is added as a row immediately, so it needn't be searchable before refetch.
  const catalogItems = buildCatalogItems(loadedProducts, loadedPacks);

  const addRow = (row: Row) => setRows((current) => [...current, row]);

  /**
   * Resolve a scanned code into a row, or open the not-found panel. Returns
   * false to leave the text in the box so a mistyped digit can be fixed.
   */
  const resolveBarcode = async (raw: string): Promise<boolean> => {
    setError(null);
    setResolving(true);
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
        setError(`"${raw}" isn't a valid barcode — check the digits`);
        return false;
      }
      setPendingCode({
        gtin14: result.gtin14,
        candidate: result.status === "candidate" ? result.item : null,
        likelyCase: result.likelyCase,
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
      return false;
    } finally {
      setResolving(false);
    }
  };

  /** A result picked by name — the same row a scan of it would have added. */
  const addFromCatalog = (item: CatalogItem) => {
    setError(null);
    if (isUnitItem(item)) {
      addRow(newUnitRow(item.id));
      return;
    }
    addRow(newPackRow(item.id));
  };

  const onSetupReady = (created: CreatedForPurchase) => {
    if (isCreatedUnit(created)) {
      setExtraProducts((current) => [
        ...current,
        { id: created.id, name: created.label },
      ]);
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

  /**
   * Display-only preview of how the server will split a pack row's cost.
   * Uses the same domain allocator, so the numbers shown are the numbers
   * stored — but the server's expansion is the authoritative one.
   */
  const previewSplit = (row: PackRow) => {
    const pack = packOptions.find((candidate) => candidate.id === row.packId);
    const qty = Number.parseInt(row.qty, 10);
    const costCents = parseDollarsToCents(row.totalCost);
    if (!pack || Number.isNaN(qty) || qty < 1 || costCents === null) {
      return null;
    }
    const weights = pack.contents.map((content) => content.units * qty);
    const costs = allocateProportionally(costCents, weights);
    return pack.contents.map((content, index) => ({
      label: `${content.units * qty} × ${
        productOptions.find((product) => product.id === content.productId)
          ?.name ?? "…"
      }`,
      cents: costs[index] ?? 0,
    }));
  };

  const enteredCents = rows.reduce(
    (sum, row) => sum + (parseDollarsToCents(row.totalCost) ?? 0),
    0,
  );
  const receiptTotalCents = parseDollarsToCents(receiptTotal);
  const variance =
    receiptTotalCents !== null && receiptTotal.trim()
      ? enteredCents - receiptTotalCents
      : null;

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows(
      rows.map((row, i) => (i === index ? ({ ...row, ...patch } as Row) : row)),
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!vendor.trim()) {
      setError("Vendor is required");
      return;
    }

    const lines = [];
    const packLines = [];
    for (const [index, row] of rows.entries()) {
      const totalCostCents = parseDollarsToCents(row.totalCost);
      if (totalCostCents === null) {
        setError(`Line ${index + 1}: cost must be a dollar amount`);
        return;
      }
      if (isPackRow(row)) {
        const qty = Number.parseInt(row.qty, 10);
        if (!row.packId || Number.isNaN(qty) || qty < 1) {
          setError(`Line ${index + 1}: pick a pack and how many`);
          return;
        }
        packLines.push({ packId: row.packId, qty, totalCostCents });
      } else {
        const units = Number.parseInt(row.units, 10);
        if (!row.productId || Number.isNaN(units) || units < 1) {
          setError(`Line ${index + 1}: pick a product and how many units`);
          return;
        }
        lines.push({
          productId: row.productId,
          units,
          totalCostCents,
          packId: row.packId,
        });
      }
    }
    if (lines.length === 0 && packLines.length === 0) {
      setError("Scan a barcode or add an item to get started");
      return;
    }

    const data = {
      purchasedAt: new Date(`${date}${MIDDAY_SUFFIX}`).toISOString(),
      vendor: vendor.trim(),
      lines,
      packLines,
      receiptTotalCents: receiptTotal.trim() ? receiptTotalCents : null,
      notes: notes.trim() || null,
    };
    if (purchaseId) {
      update.mutate({ id: purchaseId, ...data });
    } else {
      create.mutate(data);
    }
  };

  return (
    <Page max="2xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>{purchaseId ? "Edit Purchase" : "Log Purchase"}</PageTitle>
        <Link
          to="/purchases"
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          ← Back
        </Link>
      </div>

      <ErrorNote message={error} />

      {/* Entry sits outside the form so Enter adds a line rather than
          submitting the whole purchase. */}
      <div className="space-y-3 rounded-card border border-line bg-gray-50 p-3">
        <ScanOrSearchInput
          items={catalogItems}
          busy={resolving}
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
            onReady={onSetupReady}
            onCancel={() => setPendingCode(null)}
          />
        ) : null}

        <div className="flex gap-4 text-sm">
          <button
            type="button"
            onClick={() =>
              addRow(newUnitRow(""))
            }
            className="text-primary-600 hover:text-primary-500"
          >
            + Add item without a barcode
          </button>
          <button
            type="button"
            onClick={() =>
              addRow(newPackRow(""))
            }
            className="text-primary-600 hover:text-primary-500"
          >
            + Add pack without a barcode
          </button>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Vendor *"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">
            Items on this receipt
          </legend>
          {rows.length === 0 ? (
            <p className="rounded border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
              Nothing yet — scan a barcode above to start.
            </p>
          ) : null}
          {rows.map((row, index) => {
            const split = isPackRow(row) ? previewSplit(row) : null;
            return (
              <div key={index} className="space-y-1">
                <div className="grid grid-cols-[3.5rem_1fr_5rem_7rem_2rem] items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-center text-[10px] font-medium uppercase ${
                      isPackRow(row)
                        ? "bg-primary-100 text-primary-700"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {isPackRow(row) ? "Pack" : "Item"}
                  </span>
                  {isPackRow(row) ? (
                    <select
                      className={inputClass}
                      value={row.packId}
                      onChange={(e) =>
                        setRow(index, { packId: e.target.value })
                      }
                    >
                      <option value="">Pack…</option>
                      {packOptions.map((pack) => (
                        <option key={pack.id} value={pack.id}>
                          {pack.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className={inputClass}
                      value={row.productId}
                      onChange={(e) =>
                        setRow(index, { productId: e.target.value })
                      }
                    >
                      <option value="">Product…</option>
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    className={inputClass}
                    placeholder={isPackRow(row) ? "Packs" : "Units"}
                    value={isPackRow(row) ? row.qty : row.units}
                    onChange={(e) =>
                      setRow(
                        index,
                        isPackRow(row)
                          ? { qty: e.target.value }
                          : { units: e.target.value },
                      )
                    }
                  />
                  <input
                    className={inputClass}
                    placeholder="Total $"
                    value={row.totalCost}
                    onChange={(e) =>
                      setRow(index, { totalCost: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                    className="text-gray-400 hover:text-red-600"
                    title="Remove line"
                  >
                    ✕
                  </button>
                </div>
                {split ? (
                  <p className="pl-[4rem] text-xs text-gray-500">
                    ↳ saves as{" "}
                    {split
                      .map(
                        (part) => `${part.label} (${formatCents(part.cents)})`,
                      )
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        {/* Reconciliation: what we're recording vs what the receipt says. */}
        <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-gray-50 p-3">
          <label className="text-xs text-gray-600">
            Receipt total (optional)
            <input
              className={inputClass}
              placeholder="e.g. 128.47"
              value={receiptTotal}
              onChange={(e) => setReceiptTotal(e.target.value)}
            />
          </label>
          <div className="pb-2 text-sm">
            <span className="text-gray-600">Entered: </span>
            <span className="font-medium text-gray-800">
              {formatCents(enteredCents)}
            </span>
          </div>
          {variance !== null ? (
            variance === 0 ? (
              <span className="mb-2 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                matches receipt
              </span>
            ) : (
              <span className="mb-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {variance > 0 ? "over" : "under"} by{" "}
                {formatCents(Math.abs(variance))}
              </span>
            )
          ) : null}
        </div>

        <textarea
          className={inputClass}
          placeholder="Notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <Button
          size="sm"
          type="submit"
          disabled={create.isPending || update.isPending}
        >
          {purchaseId ? "Save Changes" : "Save Purchase"}
        </Button>
      </form>
    </Page>
  );
}
