import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { allocateProportionally } from "@vendpire/domain";
import { queryClient, trpc, trpcClient } from "../trpc.ts";
import { ErrorNote, inputClass, Page } from "../components/ui.tsx";
import {
  BarcodeSetupPanel,
  type CreatedForPurchase,
} from "../components/BarcodeSetupPanel.tsx";
import { formatCents, parseDollarsToCents } from "../lib/money.ts";

/**
 * One line of the purchase being entered. A row is either a pack (N packs for
 * one total, expanded server-side) or loose units of a single product —
 * whichever the scanned barcode turned out to be.
 */
type Row =
  | { kind: "pack"; packId: string; qty: string; totalCost: string }
  | {
      kind: "unit";
      productId: string;
      units: string;
      totalCost: string;
      /** Provenance preserved when editing an existing purchase. */
      packId: string | null;
    };

interface PackOption {
  id: string;
  name: string;
  contents: { productId: string; units: number }[];
}

const toDateInput = (iso: string): string => iso.slice(0, 10);

/** Create + edit form: `purchaseId` present means edit. */
export function PurchaseFormScreen({ purchaseId }: { purchaseId?: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [vendor, setVendor] = useState("Costco");
  const [notes, setNotes] = useState("");
  const [receiptTotal, setReceiptTotal] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  const [code, setCode] = useState("");
  const [resolving, setResolving] = useState(false);
  // Set when a scanned code isn't in the catalog yet — the setup panel below
  // turns it into a product or a pack before it can join the purchase.
  const [pendingCode, setPendingCode] = useState<{
    gtin14: string;
    candidate: { name: string | null; brand: string | null; imageUrl: string | null } | null;
  } | null>(null);
  // Records created mid-entry, so their <option> exists before the list query
  // refetches.
  const [extraProducts, setExtraProducts] = useState<{ id: string; name: string }[]>([]);
  const [extraPacks, setExtraPacks] = useState<PackOption[]>([]);

  const products = useQuery(trpc.products.list.queryOptions());
  const packs = useQuery(trpc.packs.list.queryOptions());
  const existing = useQuery({
    ...trpc.purchases.get.queryOptions({ id: purchaseId ?? "" }),
    enabled: Boolean(purchaseId),
  });

  const productOptions = [
    ...(products.data ?? []).map((product) => ({
      id: product.id,
      name: product.name,
    })),
    ...extraProducts.filter(
      (extra) => !products.data?.some((product) => product.id === extra.id),
    ),
  ];
  const packOptions: PackOption[] = [
    ...(packs.data ?? []),
    ...extraPacks.filter((extra) => !packs.data?.some((pack) => pack.id === extra.id)),
  ];

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
        ? String(purchase.receiptTotalCents / 100)
        : "",
    );
    setRows(
      purchase.lines.map((line) => ({
        kind: "unit" as const,
        productId: line.productId,
        units: String(line.units),
        totalCost: String(line.totalCostCents / 100),
        packId: line.packId,
      })),
    );
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

  const addRow = (row: Row) => setRows((current) => [...current, row]);

  /** Resolve a scanned/typed code and turn it into the right kind of row. */
  const scan = async () => {
    const raw = code.trim();
    if (!raw) {
      return;
    }
    setError(null);
    setResolving(true);
    try {
      const result = await trpcClient.barcodes.resolve.query({ code: raw });
      switch (result.status) {
        case "product":
          addRow({
            kind: "unit",
            productId: result.product.id,
            units: "",
            totalCost: "",
            packId: null,
          });
          setCode("");
          break;
        case "pack":
          addRow({ kind: "pack", packId: result.pack.id, qty: "1", totalCost: "" });
          setCode("");
          break;
        case "candidate":
          setPendingCode({ gtin14: result.gtin14, candidate: result.item });
          setCode("");
          break;
        case "unknown":
          setPendingCode({ gtin14: result.gtin14, candidate: null });
          setCode("");
          break;
        case "invalid":
          setError(`"${raw}" isn't a valid barcode — check the digits`);
          break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setResolving(false);
    }
  };

  const onSetupReady = (created: CreatedForPurchase) => {
    if (created.kind === "unit") {
      setExtraProducts((current) => [
        ...current,
        { id: created.id, name: created.label },
      ]);
      addRow({
        kind: "unit",
        productId: created.id,
        units: "",
        totalCost: "",
        packId: null,
      });
    } else {
      setExtraPacks((current) => [
        ...current,
        { id: created.id, name: created.label, contents: created.contents ?? [] },
      ]);
      addRow({ kind: "pack", packId: created.id, qty: "1", totalCost: "" });
    }
    setPendingCode(null);
  };

  /**
   * Display-only preview of how the server will split a pack row's cost.
   * Uses the same domain allocator, so the numbers shown are the numbers
   * stored — but the server's expansion is the authoritative one.
   */
  const previewSplit = (row: Extract<Row, { kind: "pack" }>) => {
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
        productOptions.find((product) => product.id === content.productId)?.name ??
        "…"
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
      if (row.kind === "pack") {
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
      purchasedAt: new Date(`${date}T12:00:00`).toISOString(),
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
        <h1 className="font-heading text-xl font-bold text-grey-800">
          {purchaseId ? "Edit Purchase" : "Log Purchase"}
        </h1>
        <Link to="/purchases" className="text-sm text-grey-600 hover:text-grey-800">
          ← Back
        </Link>
      </div>

      <ErrorNote message={error} />

      {/* Scan-first entry. Outside the form so Enter adds a line rather than
          submitting the purchase. */}
      <div className="space-y-3 rounded border border-grey-200 bg-grey-50 p-3">
        <div className="flex gap-2">
          <input
            className={`${inputClass} font-mono`}
            placeholder="Scan or type a barcode — case or single item"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void scan();
              }
            }}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => void scan()}
            disabled={resolving || !code.trim()}
            className="shrink-0 rounded bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-40"
          >
            {resolving ? "…" : "Add"}
          </button>
        </div>

        {pendingCode ? (
          <BarcodeSetupPanel
            gtin14={pendingCode.gtin14}
            candidate={pendingCode.candidate}
            products={productOptions}
            onReady={onSetupReady}
            onCancel={() => setPendingCode(null)}
          />
        ) : null}

        <div className="flex gap-4 text-sm">
          <button
            type="button"
            onClick={() =>
              addRow({
                kind: "unit",
                productId: "",
                units: "",
                totalCost: "",
                packId: null,
              })
            }
            className="text-primary-600 hover:text-primary-500"
          >
            + Add item without a barcode
          </button>
          <button
            type="button"
            onClick={() => addRow({ kind: "pack", packId: "", qty: "1", totalCost: "" })}
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
          <legend className="text-sm font-medium text-grey-700">
            Items on this receipt
          </legend>
          {rows.length === 0 ? (
            <p className="rounded border border-dashed border-grey-300 p-4 text-center text-sm text-grey-500">
              Nothing yet — scan a barcode above to start.
            </p>
          ) : null}
          {rows.map((row, index) => {
            const split = row.kind === "pack" ? previewSplit(row) : null;
            return (
              <div key={index} className="space-y-1">
                <div className="grid grid-cols-[3.5rem_1fr_5rem_7rem_2rem] items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-center text-[10px] font-medium uppercase ${
                      row.kind === "pack"
                        ? "bg-primary-100 text-primary-700"
                        : "bg-grey-200 text-grey-600"
                    }`}
                  >
                    {row.kind === "pack" ? "Pack" : "Item"}
                  </span>
                  {row.kind === "pack" ? (
                    <select
                      className={inputClass}
                      value={row.packId}
                      onChange={(e) => setRow(index, { packId: e.target.value })}
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
                      onChange={(e) => setRow(index, { productId: e.target.value })}
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
                    placeholder={row.kind === "pack" ? "Packs" : "Units"}
                    value={row.kind === "pack" ? row.qty : row.units}
                    onChange={(e) =>
                      setRow(
                        index,
                        row.kind === "pack"
                          ? { qty: e.target.value }
                          : { units: e.target.value },
                      )
                    }
                  />
                  <input
                    className={inputClass}
                    placeholder="Total $"
                    value={row.totalCost}
                    onChange={(e) => setRow(index, { totalCost: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                    className="text-grey-400 hover:text-red-600"
                    title="Remove line"
                  >
                    ✕
                  </button>
                </div>
                {split ? (
                  <p className="pl-[4rem] text-xs text-grey-500">
                    ↳ saves as{" "}
                    {split
                      .map((part) => `${part.label} (${formatCents(part.cents)})`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        {/* Reconciliation: what we're recording vs what the receipt says. */}
        <div className="flex flex-wrap items-end gap-3 rounded border border-grey-200 bg-grey-50 p-3">
          <label className="text-xs text-grey-600">
            Receipt total (optional)
            <input
              className={inputClass}
              placeholder="e.g. 128.47"
              value={receiptTotal}
              onChange={(e) => setReceiptTotal(e.target.value)}
            />
          </label>
          <div className="pb-2 text-sm">
            <span className="text-grey-600">Entered: </span>
            <span className="font-medium text-grey-800">
              {formatCents(enteredCents)}
            </span>
          </div>
          {variance !== null ? (
            variance === 0 ? (
              <span className="mb-2 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                matches receipt
              </span>
            ) : (
              <span className="mb-2 rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                {variance > 0 ? "over" : "under"} by {formatCents(Math.abs(variance))}
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

        <button
          type="submit"
          disabled={create.isPending || update.isPending}
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
        >
          {purchaseId ? "Save Changes" : "Save Purchase"}
        </button>
      </form>
    </Page>
  );
}
