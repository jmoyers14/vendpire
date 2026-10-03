/**
 * Text search over the operator's OWN catalog — products and packs in one
 * ranked list. Pure and synchronous: both lists are already loaded on the
 * purchase screen, so searching them needs no endpoint and no network.
 *
 * Deliberately matches on name only. Digits route to barcode resolution long
 * before they reach here, so matching codes would only ever create ambiguity.
 */

export type CatalogKind = "unit" | "pack";

export interface CatalogItem {
  kind: CatalogKind;
  id: string;
  name: string;
  /** Unit upc, or a pack's first case barcode. Null means "no code yet". */
  barcode: string | null;
  imageUrl: string | null;
  /** Packs only: units in one pack, for the "35 units" hint. */
  units: number | null;
}

interface ProductLike {
  id: string;
  name: string;
  upc: string | null;
  imageUrl: string | null;
  active: boolean;
}

interface PackLike {
  id: string;
  name: string;
  barcodes: string[];
  contents: { productId: string; units: number }[];
  active: boolean;
}

export const DEFAULT_SEARCH_LIMIT = 8;

/** Flatten both catalogs into one list the dropdown can render uniformly. */
export const buildCatalogItems = (
  products: ProductLike[],
  packs: PackLike[],
): CatalogItem[] => [
  ...products
    .filter((product) => product.active)
    .map((product): CatalogItem => ({
      kind: "unit",
      id: product.id,
      name: product.name,
      barcode: product.upc,
      imageUrl: product.imageUrl,
      units: null,
    })),
  ...packs
    .filter((pack) => pack.active)
    .map((pack): CatalogItem => ({
      kind: "pack",
      id: pack.id,
      name: pack.name,
      barcode: pack.barcodes[0] ?? null,
      imageUrl: null,
      units: pack.contents.reduce((sum, content) => sum + content.units, 0),
    })),
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
