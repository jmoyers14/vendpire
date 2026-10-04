/**
 * Text search over the operator's OWN catalog — products and packs in one
 * ranked list. Pure and synchronous: both lists are already loaded on the
 * purchase screen, so searching them needs no endpoint and no network.
 *
 * Deliberately matches on name only. Digits route to barcode resolution long
 * before they reach here, so matching codes would only ever create ambiguity.
 */

import type { ApiPack, ApiProduct } from "../../apiTypes.ts";

/**
 * What this module needs of a record, derived from the wire type so a server
 * rename still breaks the build — but narrow enough that a caller (or a test)
 * supplies only what's actually read.
 */
export type SearchableProduct = Pick<
  ApiProduct,
  "id" | "name" | "upc" | "imageUrl" | "active"
>;
export type SearchablePack = Pick<
  ApiPack,
  "id" | "name" | "barcodes" | "contents" | "active"
>;

interface CatalogItemBase {
  id: string;
  name: string;
  /** Unit upc, or a pack's first case barcode. Null means "no code yet". */
  barcode: string | null;
}

export interface UnitItem extends CatalogItemBase {
  kind: "unit";
  imageUrl: string | null;
}

export interface PackItem extends CatalogItemBase {
  kind: "pack";
  /** Units in one pack, totalled across its contents. */
  units: number;
}

/**
 * A union rather than one shape with nullable fields: a pack always has a unit
 * count and never an image, and a product the reverse. Encoding that in the
 * type means a guard narrows it away instead of every caller null-checking.
 */
export type CatalogItem = UnitItem | PackItem;

export type CatalogKind = CatalogItem["kind"];

export const isUnitItem = (item: CatalogItem): item is UnitItem =>
  item.kind === "unit";

export const isPackItem = (item: CatalogItem): item is PackItem =>
  item.kind === "pack";

export const DEFAULT_SEARCH_LIMIT = 8;

const isActive = (record: { active: boolean }): boolean => record.active;

const toUnitItem = (product: SearchableProduct): UnitItem => ({
  kind: "unit",
  id: product.id,
  name: product.name,
  barcode: product.upc,
  imageUrl: product.imageUrl,
});

const toPackItem = (pack: SearchablePack): PackItem => ({
  kind: "pack",
  id: pack.id,
  name: pack.name,
  barcode: pack.barcodes[0] ?? null,
  units: pack.contents.reduce((sum, content) => sum + content.units, 0),
});

/** Flatten both catalogs into one list the dropdown can render uniformly. */
export const buildCatalogItems = (
  products: SearchableProduct[],
  packs: SearchablePack[],
): CatalogItem[] => [
  ...products.filter(isActive).map(toUnitItem),
  ...packs.filter(isActive).map(toPackItem),
];

/**
 * Lower is better. Ranks where the term lands, so "coke" puts "Coke Zero"
 * above "Diet Coke" above "Costco Coke Variety".
 */
const scoreTerm = (name: string, term: string): number | null => {
  const index = name.indexOf(term);
  if (index === -1) {
    return null;
  }
  if (index === 0) {
    return name.length === term.length ? 0 : 1;
  }
  return name[index - 1] === " " ? 2 : 3;
};

/**
 * Every term must appear somewhere in the name, so "coke case" narrows rather
 * than widens. Ties break toward the shorter name — the more specific match.
 */
export const searchCatalogItems = (
  items: CatalogItem[],
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): CatalogItem[] => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  const scored: { item: CatalogItem; score: number }[] = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    let total = 0;
    let matchedAll = true;
    for (const term of terms) {
      const score = scoreTerm(name, term);
      if (score === null) {
        matchedAll = false;
        break;
      }
      total += score;
    }
    if (matchedAll) {
      scored.push({ item, score: total });
    }
  }

  return scored
    .sort((a, b) => a.score - b.score || a.item.name.length - b.item.name.length)
    .slice(0, limit)
    .map((entry) => entry.item);
};

/**
 * A scanner only ever emits digits, so anything with a letter in it is a
 * person searching. Separators are stripped first — "049000-042559" pasted
 * off a receipt is still a barcode.
 */
export const looksLikeBarcode = (value: string): boolean => {
  const compact = value.trim().replace(/[\s-]/g, "");
  return compact.length > 0 && /^\d+$/.test(compact);
};
