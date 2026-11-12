import { normalizeGtin } from "@vendpire/domain";
import { useState } from "react";
import type { ApiCandidate, ApiPack, ApiProduct } from "../../apiTypes.ts";
import { queryClient, trpc, trpcClient } from "../../trpc.ts";
import {
  Badge,
  Button,
  ChipGroup,
  type ChipOption,
  ErrorNote,
  Field,
  IconButton,
  InfoHint,
  insetFocusRing,
  Select,
  TextInput,
} from "../../ui.tsx";
import { parseDollarsToCents } from "../../utils/money.ts";
import {
  buildCatalogItems,
  type CatalogItem,
  isPackItem,
  isUnitItem,
  searchCatalogItems,
} from "./catalogSearch.ts";

export interface CreatedUnit {
  kind: "unit";
  id: string;
  label: string;
}

export interface CreatedPack {
  kind: "pack";
  id: string;
  label: string;
  /** Lets the caller preview the cost split immediately. */
  contents: ApiPack["contents"];
}

/**
 * What the panel handed back, for the caller to turn into a purchase row.
 * A union so `contents` is present exactly when it means something.
 */
export type CreatedForPurchase = CreatedUnit | CreatedPack;

export const isCreatedUnit = (
  created: CreatedForPurchase,
): created is CreatedUnit => created.kind === "unit";

interface BarcodeNotFoundPanelProps {
  gtin14: string;
  /** Present when an outside catalog recognised the code. */
  candidate: ApiCandidate | null;
  /** From normalizeGtin: a case-level code, so open on "a case". */
  likelyCase: boolean;
  products: ApiProduct[];
  packs: ApiPack[];
  onReady: (created: CreatedForPurchase) => void;
  onCancel: () => void;
}

const NEW_PRODUCT = "__new__";

const KIND_OPTIONS: ChipOption<"unit" | "pack">[] = [
  { value: "unit", label: "A single item" },
  { value: "pack", label: "A case / pack" },
];

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

const candidateName = (candidate: ApiCandidate | null): string => {
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
      if (isUnitItem(item)) {
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-card border border-warning-indicator bg-warning-soft p-4">
      {/* What happened and which code lead; the outside guess is set aside in
          its own card so it reads as a suggestion, not as a fact about the
          operator's catalog. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-heading text-ink">Barcode not found</h2>
          <p className="font-mono text-mono text-warning">{gtin14}</p>
          {candidate?.name ? null : (
            <p className="mt-1 text-body-sm text-ink-soft">
              Nobody recognises this code. Tell us what it is.
            </p>
          )}
        </div>
        {candidate?.name ? (
          <div className="flex w-56 shrink-0 items-center gap-2 rounded-panel border border-line bg-card p-2">
            {candidate.imageUrl ? (
              <img src={candidate.imageUrl} alt="" className="size-10 shrink-0 object-contain" />
            ) : null}
            <span className="min-w-0">
              <span className="flex items-center gap-1">
                <span className="text-label text-ink">Maybe</span>
                <InfoHint text="From Open Food Facts — a community product database, not your catalog." />
              </span>
              <span className="line-clamp-2 text-body-sm text-ink-soft">
                {candidateName(candidate)}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <ErrorNote message={error} />

      {mode === "choose" ? (
        <div className="grid gap-2">
          <Button variant="secondary" onClick={() => setMode("attach")}>
            Link barcode to an existing product
          </Button>
          <Button variant="secondary" onClick={() => setMode("create")}>
            Create new product for barcode
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : mode === "attach" ? (
        <div className="grid gap-2">
          <Field label="Add this code to something you already have">
            <TextInput
              placeholder="Search your products and cases…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </Field>
          {query.trim() ? (
            <ul className="max-h-60 divide-y divide-divider overflow-auto rounded-panel border border-line bg-card">
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-body-sm text-muted-strong">
                  Nothing matches — create it below instead.
                </li>
              ) : (
                matches.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void attach(item)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-app disabled:opacity-50 ${insetFocusRing}`}
                    >
                      <Badge tone={isPackItem(item) ? "action" : "neutral"} size="sm">
                        {isPackItem(item) ? "Case" : "Item"}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm text-ink">{item.name}</span>
                        <span className="block font-mono text-body-sm text-muted-strong">
                          {item.barcode ?? "no barcode yet"}
                          {isPackItem(item) ? ` · ${item.units} units` : ""}
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <ChipGroup label="What is it?" options={KIND_OPTIONS} value={kind} onChange={setKind} />

          {kind === "pack" ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
              <Field label="Case name">
                <TextInput
                  placeholder="e.g. Frito-Lay 30ct variety"
                  value={shownPackName}
                  onChange={(e) => {
                    setPackNameTouched(true);
                    setPackName(e.target.value);
                  }}
                />
              </Field>

              <fieldset className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                <legend className="mb-2 text-label text-ink">
                  What’s inside one case, in sellable units
                </legend>
                {contents.map((row, index) => (
                  // Rows are positional and can be reordered by removal, so the
                  // index is the only stable key available.
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)] gap-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_5rem_2.25rem] items-center gap-2">
                      <Select
                        aria-label="Product"
                        value={row.productId}
                        onChange={(e) => setContent(index, { productId: e.target.value })}
                      >
                        <option value={NEW_PRODUCT}>➕ New product…</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </Select>
                      <TextInput
                        aria-label="Units"
                        placeholder="Units"
                        value={row.units}
                        onChange={(e) => setContent(index, { units: e.target.value })}
                      />
                      <IconButton
                        label="Remove this product"
                        tone="danger"
                        onClick={() => setContents(contents.filter((_, i) => i !== index))}
                        disabled={contents.length === 1}
                      >
                        ✕
                      </IconButton>
                    </div>
                    {row.productId === NEW_PRODUCT ? (
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_11rem] sm:pr-[2.75rem]">
                        <TextInput
                          aria-label="New product name"
                          placeholder="Name, e.g. Doritos Nacho Cheese"
                          value={row.name}
                          onChange={(e) => setContent(index, { name: e.target.value })}
                        />
                        <TextInput
                          aria-label="Category"
                          placeholder="Category"
                          value={row.category}
                          onChange={(e) => setContent(index, { category: e.target.value })}
                        />
                        <TextInput
                          aria-label="Bag barcode"
                          className="font-mono"
                          placeholder="bag barcode (optional)"
                          value={row.bagCode}
                          onChange={(e) => setContent(index, { bagCode: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="text"
                  size="sm"
                  className="justify-self-start text-left whitespace-normal!"
                  onClick={() => setContents([...contents, { ...EMPTY_CONTENT }])}
                >
                  + Add another product (variety packs have several)
                </Button>
              </fieldset>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
              <Field label="Name">
                <TextInput
                  placeholder="e.g. Coca-Cola Zero 12 oz can"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Category">
                <TextInput
                  placeholder="e.g. drinks"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </Field>
              <Field
                label="Sell price $"
                isOptional
                hint="Only a starting price. Each slot's price is set on the planogram."
              >
                <TextInput
                  inputMode="decimal"
                  placeholder="1.75"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
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
