import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass, Page } from "../components/ui.tsx";
import { allocateProportionally } from "@vendpire/domain";
import { parseDollarsToCents } from "../lib/money.ts";

interface LineRow {
  productId: string;
  units: string;
  totalCost: string;
  /** Set when the line came from expanding a pack. */
  packId: string | null;
}

const EMPTY_LINE: LineRow = { productId: "", units: "", totalCost: "", packId: null };

const toDateInput = (iso: string): string => iso.slice(0, 10);

/** Create + edit form: `purchaseId` present means edit. */
export function PurchaseFormScreen({ purchaseId }: { purchaseId?: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [vendor, setVendor] = useState("Costco");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([{ ...EMPTY_LINE }]);

  const products = useQuery(trpc.products.list.queryOptions());
  const packs = useQuery(trpc.packs.list.queryOptions());
  const [packPick, setPackPick] = useState({ packId: "", qty: "1", cost: "" });
  const existing = useQuery({
    ...trpc.purchases.get.queryOptions({ id: purchaseId ?? "" }),
    enabled: Boolean(purchaseId),
  });

  useEffect(() => {
    const purchase = existing.data;
    if (!purchase) {
      return;
    }
    setDate(toDateInput(purchase.purchasedAt));
    setVendor(purchase.vendor);
    setNotes(purchase.notes ?? "");
    setLines(
      purchase.lines.map((line) => ({
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!vendor.trim()) {
      setError("Vendor is required");
      return;
    }
    const parsed = [];
    for (const [index, line] of lines.entries()) {
      if (!line.productId && !line.units && !line.totalCost) {
        continue;
      }
      const units = Number.parseInt(line.units, 10);
      const totalCostCents = parseDollarsToCents(line.totalCost);
      if (!line.productId || Number.isNaN(units) || units < 1 || totalCostCents === null) {
        setError(`Line ${index + 1}: needs a product, unit count, and total cost`);
        return;
      }
      parsed.push({
        productId: line.productId,
        units,
        totalCostCents,
        packId: line.packId,
      });
    }
    if (parsed.length === 0) {
      setError("Add at least one line");
      return;
    }
    const data = {
      purchasedAt: new Date(`${date}T12:00:00`).toISOString(),
      vendor: vendor.trim(),
      lines: parsed,
      notes: notes.trim() || null,
    };
    if (purchaseId) {
      update.mutate({ id: purchaseId, ...data });
    } else {
      create.mutate(data);
    }
  };

  // Expand a pack purchase into per-product lines: units multiply by pack
  // quantity, and the pack's total cost splits across contents by unit count
  // (largest-remainder, so the lines sum exactly to the receipt).
  const addPack = () => {
    setError(null);
    const pack = packs.data?.find((candidate) => candidate.id === packPick.packId);
    const qty = Number.parseInt(packPick.qty, 10);
    const costCents = parseDollarsToCents(packPick.cost);
    if (!pack || Number.isNaN(qty) || qty < 1 || costCents === null) {
      setError("Pick a pack, a quantity, and the total paid for the packs");
      return;
    }
    const weights = pack.contents.map((content) => content.units * qty);
    const costs = allocateProportionally(costCents, weights);
    const newLines = pack.contents.map((content, index) => ({
      productId: content.productId,
      units: String(content.units * qty),
      totalCost: String((costs[index] ?? 0) / 100),
      packId: pack.id,
    }));
    const keep = lines.filter(
      (line) => line.productId || line.units || line.totalCost,
    );
    setLines([...keep, ...newLines]);
    setPackPick({ packId: "", qty: "1", cost: "" });
  };

  const setLine = (index: number, patch: Partial<LineRow>) =>
    setLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

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
            Items (units + TOTAL cost per line, straight off the receipt)
          </legend>
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_6rem_7rem_2rem] gap-2">
              <select
                className={inputClass}
                value={line.productId}
                onChange={(e) => setLine(index, { productId: e.target.value })}
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
                onChange={(e) => setLine(index, { units: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Total $"
                value={line.totalCost}
                onChange={(e) => setLine(index, { totalCost: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setLines(lines.filter((_, i) => i !== index))}
                className="text-grey-400 hover:text-red-600"
                title="Remove line"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines([...lines, { ...EMPTY_LINE }])}
            className="text-sm text-primary-600 hover:text-primary-500"
          >
            + Add line
          </button>
        </fieldset>

        <fieldset className="space-y-2 rounded border border-grey-200 p-3">
          <legend className="px-1 text-sm font-medium text-grey-700">
            Add a pack — expands into product lines with the cost split
          </legend>
          <div className="grid grid-cols-[1fr_4rem_6rem_auto] gap-2">
            <select
              className={inputClass}
              value={packPick.packId}
              onChange={(e) => setPackPick({ ...packPick, packId: e.target.value })}
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
              value={packPick.qty}
              onChange={(e) => setPackPick({ ...packPick, qty: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Total $"
              value={packPick.cost}
              onChange={(e) => setPackPick({ ...packPick, cost: e.target.value })}
            />
            <button
              type="button"
              onClick={addPack}
              className="rounded border border-primary-300 px-3 text-sm text-primary-600 hover:bg-primary-50"
            >
              Expand
            </button>
          </div>
        </fieldset>

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
