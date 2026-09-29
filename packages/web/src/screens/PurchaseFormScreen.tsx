import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { allocateProportionally } from "@vendpire/domain";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass, Page } from "../components/ui.tsx";
import { formatCents, parseDollarsToCents } from "../lib/money.ts";

interface UnitLineRow {
  productId: string;
  units: string;
  totalCost: string;
  /** Provenance for lines that came from a pack (preserved on edit). */
  packId: string | null;
}

interface PackLineRow {
  packId: string;
  qty: string;
  totalCost: string;
}

const EMPTY_UNIT_LINE: UnitLineRow = {
  productId: "",
  units: "",
  totalCost: "",
  packId: null,
};
const EMPTY_PACK_LINE: PackLineRow = { packId: "", qty: "1", totalCost: "" };

const toDateInput = (iso: string): string => iso.slice(0, 10);

const isBlankUnitLine = (line: UnitLineRow): boolean =>
  !line.productId && !line.units && !line.totalCost;
const isBlankPackLine = (line: PackLineRow): boolean =>
  !line.packId && !line.totalCost;

/** Create + edit form: `purchaseId` present means edit. */
export function PurchaseFormScreen({ purchaseId }: { purchaseId?: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [vendor, setVendor] = useState("Costco");
  const [notes, setNotes] = useState("");
  const [receiptTotal, setReceiptTotal] = useState("");
  const [unitLines, setUnitLines] = useState<UnitLineRow[]>([
    { ...EMPTY_UNIT_LINE },
  ]);
  const [packLines, setPackLines] = useState<PackLineRow[]>([]);

  const products = useQuery(trpc.products.list.queryOptions());
  const packs = useQuery(trpc.packs.list.queryOptions());
  const existing = useQuery({
    ...trpc.purchases.get.queryOptions({ id: purchaseId ?? "" }),
    enabled: Boolean(purchaseId),
  });

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
    setUnitLines(
      purchase.lines.map((line) => ({
        productId: line.productId,
        units: String(line.units),
        totalCost: String(line.totalCostCents / 100),
        packId: line.packId,
      })),
    );
    setPackLines([]);
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

  const productName = (id: string): string =>
    products.data?.find((product) => product.id === id)?.name ?? "…";

  /**
   * Display-only preview of how the server will split this pack line's cost.
   * Uses the same domain allocator, so the numbers shown are the numbers
   * stored — but the server's expansion is the authoritative one.
   */
  const previewSplit = (
    row: PackLineRow,
  ): { label: string; cents: number }[] | null => {
    const pack = packs.data?.find((candidate) => candidate.id === row.packId);
    const qty = Number.parseInt(row.qty, 10);
    const costCents = parseDollarsToCents(row.totalCost);
    if (!pack || Number.isNaN(qty) || qty < 1 || costCents === null) {
      return null;
    }
    const weights = pack.contents.map((content) => content.units * qty);
    const costs = allocateProportionally(costCents, weights);
    return pack.contents.map((content, index) => ({
      label: `${content.units * qty} × ${productName(content.productId)}`,
      cents: costs[index] ?? 0,
    }));
  };

  const linesTotalCents =
    unitLines.reduce(
      (sum, line) => sum + (parseDollarsToCents(line.totalCost) ?? 0),
      0,
    ) +
    packLines.reduce(
      (sum, line) => sum + (parseDollarsToCents(line.totalCost) ?? 0),
      0,
    );
  const receiptTotalCents = parseDollarsToCents(receiptTotal);
  const variance =
    receiptTotalCents !== null && receiptTotal.trim()
      ? linesTotalCents - receiptTotalCents
      : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!vendor.trim()) {
      setError("Vendor is required");
      return;
    }

    const lines = [];
    for (const [index, line] of unitLines.entries()) {
      if (isBlankUnitLine(line)) {
        continue;
      }
      const units = Number.parseInt(line.units, 10);
      const totalCostCents = parseDollarsToCents(line.totalCost);
      if (!line.productId || Number.isNaN(units) || units < 1 || totalCostCents === null) {
        setError(`Item ${index + 1}: needs a product, unit count, and total cost`);
        return;
      }
      lines.push({
        productId: line.productId,
        units,
        totalCostCents,
        packId: line.packId,
      });
    }

    const packLinePayload = [];
    for (const [index, line] of packLines.entries()) {
      if (isBlankPackLine(line)) {
        continue;
      }
      const qty = Number.parseInt(line.qty, 10);
      const totalCostCents = parseDollarsToCents(line.totalCost);
      if (!line.packId || Number.isNaN(qty) || qty < 1 || totalCostCents === null) {
        setError(`Pack ${index + 1}: needs a pack, quantity, and total cost`);
        return;
      }
      packLinePayload.push({ packId: line.packId, qty, totalCostCents });
    }

    if (lines.length === 0 && packLinePayload.length === 0) {
      setError("Add at least one item or pack");
      return;
    }

    const data = {
      purchasedAt: new Date(`${date}T12:00:00`).toISOString(),
      vendor: vendor.trim(),
      lines,
      packLines: packLinePayload,
      receiptTotalCents: receiptTotal.trim() ? receiptTotalCents : null,
      notes: notes.trim() || null,
    };
    if (purchaseId) {
      update.mutate({ id: purchaseId, ...data });
    } else {
      create.mutate(data);
    }
  };

  const setUnitLine = (index: number, patch: Partial<UnitLineRow>) =>
    setUnitLines(
      unitLines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  const setPackLine = (index: number, patch: Partial<PackLineRow>) =>
    setPackLines(
      packLines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

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
            Packs — as the receipt reads them
          </legend>
          {packLines.map((line, index) => {
            const split = previewSplit(line);
            return (
              <div key={index} className="space-y-1">
                <div className="grid grid-cols-[1fr_4rem_7rem_2rem] gap-2">
                  <select
                    className={inputClass}
                    value={line.packId}
                    onChange={(e) => setPackLine(index, { packId: e.target.value })}
                  >
                    <option value="">Pack…</option>
                    {packs.data?.map((pack) => (
                      <option key={pack.id} value={pack.id}>
                        {pack.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    title="How many packs"
                    value={line.qty}
                    onChange={(e) => setPackLine(index, { qty: e.target.value })}
                  />
                  <input
                    className={inputClass}
                    placeholder="Total $"
                    value={line.totalCost}
                    onChange={(e) => setPackLine(index, { totalCost: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPackLines(packLines.filter((_, i) => i !== index))
                    }
                    className="text-grey-400 hover:text-red-600"
                    title="Remove pack"
                  >
                    ✕
                  </button>
                </div>
                {split ? (
                  <p className="pl-2 text-xs text-grey-500">
                    ↳ saves as{" "}
                    {split
                      .map((part) => `${part.label} (${formatCents(part.cents)})`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setPackLines([...packLines, { ...EMPTY_PACK_LINE }])}
            className="text-sm text-primary-600 hover:text-primary-500"
          >
            + Add pack
          </button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-grey-700">
            Loose items — units + TOTAL cost per line
          </legend>
          {unitLines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_6rem_7rem_2rem] gap-2">
              <select
                className={inputClass}
                value={line.productId}
                onChange={(e) => setUnitLine(index, { productId: e.target.value })}
              >
                <option value="">Product…</option>
                {products.data?.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                placeholder="Units"
                value={line.units}
                onChange={(e) => setUnitLine(index, { units: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Total $"
                value={line.totalCost}
                onChange={(e) => setUnitLine(index, { totalCost: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setUnitLines(unitLines.filter((_, i) => i !== index))}
                className="text-grey-400 hover:text-red-600"
                title="Remove line"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setUnitLines([...unitLines, { ...EMPTY_UNIT_LINE }])}
            className="text-sm text-primary-600 hover:text-primary-500"
          >
            + Add line
          </button>
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
              {formatCents(linesTotalCents)}
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
