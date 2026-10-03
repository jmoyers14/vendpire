import { useState } from "react";
import { normalizeGtin } from "@vendpire/domain";
import { queryClient, trpc, trpcClient } from "../trpc.ts";
import {
  Button,
  ErrorNote,
  hintClass,
  InfoHint,
  inputClass,
  labelClass,
} from "./ui.tsx";
import { parseDollarsToCents } from "../lib/money.ts";
import {
  type CatalogItem,
  buildCatalogItems,
  searchCatalogItems,
} from "../lib/catalogSearch.ts";

interface CatalogCandidate {
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

export interface ProductRecord {
  id: string;
  name: string;
  upc: string | null;
  category: string;
  taxClass: string | null;
  imageUrl: string | null;
  defaultPriceCents: number;
  active: boolean;
}

export interface PackRecord {
  id: string;
  name: string;
  barcodes: string[];
  contents: { productId: string; units: number }[];
  active: boolean;
}

export interface CreatedForPurchase {
  kind: "unit" | "pack";
  id: string;
  label: string;
  /** Packs only — lets the caller preview the cost split immediately. */
  contents?: { productId: string; units: number }[];
}

interface BarcodeNotFoundPanelProps {
  gtin14: string;
  /** Present when an outside catalog recognised the code. */
  candidate: CatalogCandidate | null;
  /** From normalizeGtin: a case-level code, so open on "a case". */
  likelyCase: boolean;
  products: ProductRecord[];
  packs: PackRecord[];
  onReady: (created: CreatedForPurchase) => void;
  onCancel: () => void;
}

const NEW_PRODUCT = "__new__";

/**
 * One line of a case's contents. A variety pack has several — each either an
 * existing product or one being created here, which is why the new-product
 * fields live on the row rather than on the panel.
 */
interface ContentRow {
  /** An existing product id, or NEW_PRODUCT. */
  productId: string;
  units: string;
  /** Used only when productId is NEW_PRODUCT. */
  name: string;
  category: string;
  /** The single bag's own code — never the case code we just scanned. */
  bagCode: string;
}

const EMPTY_CONTENT: ContentRow = {
  productId: NEW_PRODUCT,
  units: "",
  name: "",
  category: "",
  bagCode: "",
};

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
 * Shown when a scanned code isn't in the catalog yet. The operator picks one
 * of two ways out before any form appears: link the code to something that
 * already exists, or create the record it belongs to.
 *
 * Both are offered explicitly rather than defaulting into one, because the
 * right answer isn't guessable from the code. Creating a duplicate is the
 * expensive mistake — CSV-imported products arrive with no barcode, so the
 * thing you just scanned is often already here under a name you'd recognise.
 *
 * Where the code lands is the whole decision: a single item's code becomes
 * that product's unit `upc`; a case's code belongs to the pack, and the
 * product inside keeps its own (optional, different) bag code.
 */
export function BarcodeNotFoundPanel({
  gtin14,
  candidate,
  likelyCase,
  products,
  packs,
  onReady,
  onCancel,
}: BarcodeNotFoundPanelProps) {
  const [mode, setMode] = useState<"choose" | "attach" | "create">("choose");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState(candidateName(candidate));
  const [kind, setKind] = useState<"unit" | "pack">(likelyCase ? "pack" : "unit");
  const [name, setName] = useState(candidateName(candidate));
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [packName, setPackName] = useState("");
  const [packNameTouched, setPackNameTouched] = useState(false);
  const [contents, setContents] = useState<ContentRow[]>([
    { ...EMPTY_CONTENT, name: candidateName(candidate) },
  ]);

  const items = buildCatalogItems(products, packs);
  const matches = searchCatalogItems(items, query);

  const rowProductName = (row: ContentRow): string =>
    row.productId === NEW_PRODUCT
      ? row.name.trim()
      : (products.find((product) => product.id === row.productId)?.name ?? "");

  /**
   * A single-product case names itself precisely, so prefer that; a variety
   * pack can't be derived, so fall back to whatever the catalog guessed. Only
   * a suggestion — it stops updating the moment the field is edited.
   */
  const suggestedPackName = (): string => {
    const only = contents.length === 1 ? contents[0] : undefined;
    if (only) {
      const label = rowProductName(only);
      const units = only.units.trim();
      if (label && units) {
        return `${label} — case (${units})`;
      }
    }
    return candidateName(candidate);
  };
  const shownPackName = packNameTouched ? packName : suggestedPackName();

  const setContent = (index: number, patch: Partial<ContentRow>) =>
    setContents(
      contents.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  /** Attach the scanned code to a record that already exists. */
  const attach = async (item: CatalogItem) => {
    setError(null);
    setSaving(true);
    try {
      if (item.kind === "unit") {
        const product = products.find((candidate) => candidate.id === item.id);
        if (!product) {
          throw new Error("That product is no longer available");
        }
        const updated = await trpcClient.products.update.mutate({
          ...product,
          upc: gtin14,
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.products.list.queryKey(),
        });
        onReady({ kind: "unit", id: updated.id, label: updated.name });
        return;
      }

      const pack = packs.find((candidate) => candidate.id === item.id);
      if (!pack) {
        throw new Error("That case is no longer available");
      }
      const updated = await trpcClient.packs.update.mutate({
        ...pack,
        barcodes: [...pack.barcodes, gtin14],
      });
      await queryClient.invalidateQueries({ queryKey: trpc.packs.list.queryKey() });
      onReady({
        kind: "pack",
        id: updated.id,
        label: updated.name,
        contents: updated.contents,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach the code");
    } finally {
      setSaving(false);
    }
  };

  /** Create the single product the scanned code names. */
  const createUnit = async () => {
    if (!name.trim() || !category.trim()) {
      setError("Name and category are required");
      return;
    }
    // Price is optional: it only seeds the planogram slot, which is where the
    // real number is set. An empty field means "decide later", not zero.
    const priceCents = price.trim() ? parseDollarsToCents(price) : 0;
    if (priceCents === null) {
      setError("Sell price must be a dollar amount (e.g. 1.75), or left blank");
      return;
    }

    setSaving(true);
    try {
      const created = await trpcClient.products.create.mutate({
        name: name.trim(),
        upc: gtin14,
        category: category.trim(),
        taxClass: null,
        imageUrl: candidate?.imageUrl ?? null,
        defaultPriceCents: priceCents,
        active: true,
      });
      await queryClient.invalidateQueries({
        queryKey: trpc.products.list.queryKey(),
      });
      onReady({ kind: "unit", id: created.id, label: created.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Create the case. Any rows marked NEW_PRODUCT become products first, then
   * the pack is created pointing at them. A failure partway leaves those
   * products behind — they're records you wanted anyway, and re-running picks
   * them from the list rather than duplicating.
   */
  const createPack = async () => {
    const finalName = shownPackName.trim();
    if (!finalName) {
      setError("Give the case a name");
      return;
    }

    const rows = contents.filter(
      (row) => row.units.trim() || row.name.trim() || row.productId !== NEW_PRODUCT,
    );
    if (rows.length === 0) {
      setError("Add at least one product to the case");
      return;
    }

    const prepared: { row: ContentRow; units: number; upc: string | null }[] = [];
    for (const [index, row] of rows.entries()) {
      const units = Number.parseInt(row.units, 10);
      if (Number.isNaN(units) || units < 1) {
        setError(`Product ${index + 1}: units must be a whole number`);
        return;
      }
      if (row.productId === NEW_PRODUCT) {
        if (!row.name.trim() || !row.category.trim()) {
          setError(`Product ${index + 1}: name and category are required`);
          return;
        }
      } else if (!row.productId) {
        setError(`Product ${index + 1}: pick a product`);
        return;
      }
      // A bag code is a DIFFERENT code from the case code we just scanned.
      let upc: string | null = null;
      if (row.productId === NEW_PRODUCT && row.bagCode.trim()) {
        const normalized = normalizeGtin(row.bagCode);
        if (!normalized) {
          setError(
            `Product ${index + 1}: "${row.bagCode.trim()}" isn't a valid barcode`,
          );
          return;
        }
        upc = normalized.gtin14;
      }
      prepared.push({ row, units, upc });
    }

    setSaving(true);
    try {
      const packContents: { productId: string; units: number }[] = [];
      let createdAny = false;
      for (const { row, units, upc } of prepared) {
        if (row.productId !== NEW_PRODUCT) {
          packContents.push({ productId: row.productId, units });
          continue;
        }
        const created = await trpcClient.products.create.mutate({
          name: row.name.trim(),
          upc,
          category: row.category.trim(),
          taxClass: null,
          // The scanned image is of the CASE, so it only describes the contents
          // when the case holds one product.
          imageUrl: prepared.length === 1 ? (candidate?.imageUrl ?? null) : null,
          defaultPriceCents: 0,
          active: true,
        });
        packContents.push({ productId: created.id, units });
        createdAny = true;
      }
      if (createdAny) {
        await queryClient.invalidateQueries({
          queryKey: trpc.products.list.queryKey(),
        });
      }

      const pack = await trpcClient.packs.create.mutate({
        name: finalName,
        barcodes: [gtin14],
        contents: packContents,
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

  const create = () => {
    setError(null);
    return kind === "unit" ? createUnit() : createPack();
  };

  return (
    <div className="space-y-4 rounded-card border border-amber-200 bg-amber-50 p-4">
      {/* What happened and which code lead; the outside guess is set aside in
          its own card so it reads as a suggestion, not as a fact about the
          operator's catalog. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold text-heading">
            Barcode not found
          </h2>
          <p className="font-mono text-sm text-amber-900">{gtin14}</p>
          {candidate?.name ? null : (
            <p className="mt-1 text-sm text-amber-900">
              Nobody recognises this code. Tell us what it is.
            </p>
          )}
        </div>
        {candidate?.name ? (
          <div className="flex w-56 shrink-0 items-center gap-2 rounded-xl border border-line bg-card p-2">
            {candidate.imageUrl ? (
              <img
                src={candidate.imageUrl}
                alt=""
                className="size-10 shrink-0 object-contain"
              />
            ) : null}
            <span className="min-w-0">
              <span className="flex items-center gap-1">
                <span className="text-sm font-bold text-heading">Maybe</span>
                <InfoHint text="From Open Food Facts — a community product database, not your catalog." />
              </span>
              <span className="line-clamp-2 text-xs leading-snug text-body">
                {candidateName(candidate)}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <ErrorNote message={error} />

      {mode === "choose" ? (
        <div className="grid gap-2">
          <Button variant="outline" onClick={() => setMode("attach")}>
            Link barcode to an existing product
          </Button>
          <Button variant="outline" onClick={() => setMode("create")}>
            Create new product for barcode
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : mode === "attach" ? (
        <div className="space-y-2">
          <label className={labelClass} htmlFor="attach-search">
            Add this code to something you already have
          </label>
          <input
            id="attach-search"
            className={inputClass}
            placeholder="Search your products and cases…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query.trim() ? (
            <ul className="max-h-60 divide-y divide-divider overflow-auto rounded-xl border border-line bg-card">
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">
                  Nothing matches — create it below instead.
                </li>
              ) : (
                matches.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void attach(item)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50"
                    >
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          item.kind === "pack"
                            ? "bg-primary-100 text-primary-700"
                            : "bg-gray-200 text-gray-700"
                        }`}
                      >
                        {item.kind === "pack" ? "Case" : "Item"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-body">
                          {item.name}
                        </span>
                        <span className="block font-mono text-xs text-muted">
                          {item.barcode ?? "no barcode yet"}
                          {item.units !== null ? ` · ${item.units} units` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => setMode("choose")}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["unit", "pack"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-bold ${
                  kind === option
                    ? "border-primary-500 bg-card text-primary-700"
                    : "border-line text-gray-600 hover:bg-card"
                }`}
              >
                {option === "unit" ? "A single item" : "A case / pack"}
              </button>
            ))}
          </div>

          {kind === "pack" ? (
            <div className="space-y-2">
              <label className={hintClass}>
                Case name
                <input
                  className={inputClass}
                  placeholder="e.g. Frito-Lay 30ct variety"
                  value={shownPackName}
                  onChange={(e) => {
                    setPackNameTouched(true);
                    setPackName(e.target.value);
                  }}
                />
              </label>

              <fieldset className="space-y-2">
                <legend className={hintClass}>
                  What’s inside one case, in sellable units
                </legend>
                {contents.map((row, index) => (
                  // Rows are positional and can be reordered by removal, so the
                  // index is the only stable key available.
                  <div key={index} className="space-y-1">
                    <div className="grid grid-cols-[1fr_5rem_2rem] items-center gap-2">
                      <select
                        className={inputClass}
                        value={row.productId}
                        onChange={(e) =>
                          setContent(index, { productId: e.target.value })
                        }
                      >
                        <option value={NEW_PRODUCT}>➕ New product…</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className={inputClass}
                        placeholder="Units"
                        value={row.units}
                        onChange={(e) => setContent(index, { units: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setContents(contents.filter((_, i) => i !== index))
                        }
                        disabled={contents.length === 1}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30"
                        title="Remove this product"
                      >
                        ✕
                      </button>
                    </div>
                    {row.productId === NEW_PRODUCT ? (
                      <div className="grid grid-cols-[1fr_8rem_11rem] gap-2 pr-[2.5rem]">
                        <input
                          className={inputClass}
                          placeholder="Name, e.g. Doritos Nacho Cheese"
                          value={row.name}
                          onChange={(e) => setContent(index, { name: e.target.value })}
                        />
                        <input
                          className={inputClass}
                          placeholder="Category"
                          value={row.category}
                          onChange={(e) =>
                            setContent(index, { category: e.target.value })
                          }
                        />
                        <input
                          className={`${inputClass} font-mono`}
                          placeholder="bag barcode (optional)"
                          value={row.bagCode}
                          onChange={(e) =>
                            setContent(index, { bagCode: e.target.value })
                          }
                          autoComplete="off"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setContents([...contents, { ...EMPTY_CONTENT }])}
                  className="text-sm text-primary-600 hover:text-primary-500"
                >
                  + Add another product (variety packs have several)
                </button>
              </fieldset>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_8rem_8rem] gap-2">
              <label className={hintClass}>
                Name
                <input
                  className={inputClass}
                  placeholder="e.g. Coca-Cola Zero 12 oz can"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className={hintClass}>
                Category
                <input
                  className={inputClass}
                  placeholder="e.g. drinks"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </label>
              {/* Not a <label> wrapper: the hint is a button, which can't nest
                  inside one. */}
              <div className={hintClass}>
                <span className="flex items-center gap-1">
                  <label htmlFor="sell-price">Sell price $</label>
                  <InfoHint text="Optional. This only seeds the price when you add the product to a machine — the real price is set per slot on the planogram." />
                </span>
                <input
                  id="sell-price"
                  className={inputClass}
                  placeholder="1.75"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={() => void create()} disabled={saving}>
              {saving ? "Saving…" : "Add to purchase"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("choose")}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
