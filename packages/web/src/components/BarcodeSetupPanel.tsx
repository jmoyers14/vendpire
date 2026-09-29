import { useState } from "react";
import { queryClient, trpc, trpcClient } from "../trpc.ts";
import { ErrorNote, inputClass } from "./ui.tsx";
import { parseDollarsToCents } from "../lib/money.ts";

interface CatalogCandidate {
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

export interface CreatedForPurchase {
  kind: "unit" | "pack";
  id: string;
  label: string;
  /** Packs only — lets the caller preview the cost split immediately. */
  contents?: { productId: string; units: number }[];
}

interface BarcodeSetupPanelProps {
  gtin14: string;
  /** Present when an outside catalog recognised the code. */
  candidate: CatalogCandidate | null;
  products: { id: string; name: string }[];
  onReady: (created: CreatedForPurchase) => void;
  onCancel: () => void;
}

const NEW_PRODUCT = "__new__";

const candidateName = (candidate: CatalogCandidate | null): string => {
  if (!candidate?.name) {
    return "";
  }
  const { name, brand } = candidate;
  return brand && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${brand} ${name}`
    : name;
};

/**
 * Shown when a scanned code isn't in the catalog yet. The operator says what
 * the code IS — a single item or a case — and we create the right records so
 * the next scan of it resolves straight to a purchase line.
 *
 * The distinction matters for where the barcode lands: a single item's code is
 * that product's unit upc; a case's code belongs to the pack, and the product
 * inside keeps a null upc until its own bag is scanned.
 */
export function BarcodeSetupPanel({
  gtin14,
  candidate,
  products,
  onReady,
  onCancel,
}: BarcodeSetupPanelProps) {
  const [kind, setKind] = useState<"unit" | "pack">("unit");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(candidateName(candidate));
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [innerProductId, setInnerProductId] = useState(NEW_PRODUCT);
  const [unitsPerPack, setUnitsPerPack] = useState("");

  const needsNewProduct = kind === "unit" || innerProductId === NEW_PRODUCT;

  const save = async () => {
    setError(null);
    if (needsNewProduct && (!name.trim() || !category.trim())) {
      setError("Name and category are required");
      return;
    }
    const priceCents = needsNewProduct ? parseDollarsToCents(price) : 0;
    if (needsNewProduct && priceCents === null) {
      setError("Sell price must be a dollar amount (e.g. 1.75)");
      return;
    }
    const units = kind === "pack" ? Number.parseInt(unitsPerPack, 10) : 0;
    if (kind === "pack" && (Number.isNaN(units) || units < 1)) {
      setError("Units per pack must be a whole number");
      return;
    }

    setSaving(true);
    try {
      let productId = innerProductId;
      let productName = products.find((p) => p.id === innerProductId)?.name ?? "";

      if (needsNewProduct) {
        const created = await trpcClient.products.create.mutate({
          name: name.trim(),
          // A case code identifies the CASE, so it never becomes the unit upc.
          upc: kind === "unit" ? gtin14 : null,
          category: category.trim(),
          taxClass: null,
          imageUrl: candidate?.imageUrl ?? null,
          defaultPriceCents: priceCents ?? 0,
          active: true,
        });
        productId = created.id;
        productName = created.name;
        await queryClient.invalidateQueries({
          queryKey: trpc.products.list.queryKey(),
        });
      }

      if (kind === "unit") {
        onReady({ kind: "unit", id: productId, label: productName });
        return;
      }

      const pack = await trpcClient.packs.create.mutate({
        name: `${productName} — case (${units})`,
        barcodes: [gtin14],
        contents: [{ productId, units }],
        active: true,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.packs.list.queryKey() });
      onReady({
        kind: "pack",
        id: pack.id,
        label: pack.name,
        contents: pack.contents,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded border border-primary-200 bg-primary-50/40 p-3">
      <div className="flex items-start gap-3">
        {candidate?.imageUrl ? (
          <img
            src={candidate.imageUrl}
            alt=""
            className="h-12 w-12 rounded border border-grey-200 bg-white object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-medium text-grey-800">
            {candidate?.name
              ? "Not in your catalog yet"
              : "Unknown barcode — tell us what it is"}
          </p>
          <p className="font-mono text-xs text-grey-500">{gtin14}</p>
        </div>
      </div>

      <div className="flex gap-2 text-sm">
        {(["unit", "pack"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKind(option)}
            className={`rounded border px-3 py-1 ${
              kind === option
                ? "border-primary-500 bg-white font-medium text-primary-700"
                : "border-grey-300 text-grey-600 hover:bg-white"
            }`}
          >
            {option === "unit" ? "A single item" : "A case / pack"}
          </button>
        ))}
      </div>

      <ErrorNote message={error} />

      {kind === "pack" ? (
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <label className="text-xs text-grey-600">
            Contains
            <select
              className={inputClass}
              value={innerProductId}
              onChange={(e) => setInnerProductId(e.target.value)}
            >
              <option value={NEW_PRODUCT}>➕ New product…</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-grey-600">
            Units per pack
            <input
              className={inputClass}
              placeholder="e.g. 35"
              value={unitsPerPack}
              onChange={(e) => setUnitsPerPack(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      {needsNewProduct ? (
        <div className="grid grid-cols-[1fr_8rem_7rem] gap-2">
          <label className="text-xs text-grey-600">
            {kind === "pack" ? "New product name" : "Name"}
            <input
              className={inputClass}
              placeholder="e.g. Coca-Cola Zero 12 oz can"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-xs text-grey-600">
            Category
            <input
              className={inputClass}
              placeholder="e.g. drinks"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label className="text-xs text-grey-600">
            Sell price $
            <input
              className={inputClass}
              placeholder="1.75"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add to purchase"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-grey-300 px-3 py-1.5 text-sm text-grey-700 hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
