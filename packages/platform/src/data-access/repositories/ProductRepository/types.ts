/**
 * Product entity — plain data, free of Mongoose types. Unit cost is NOT a
 * field: it's derived from purchases as a weighted average.
 */
export interface Product {
  id: string;
  name: string;
  /** The UNIT barcode (on the can/bag itself) — null until verified. */
  upc: string | null;
  /** Case/box configurations this product is purchased in. */
  packagings: { barcode: string; unitsPerPack: number | null }[];
  category: string;
  /** Feeds California's vending tax rules (CDTFA pub. 118) in reporting. */
  taxClass: string | null;
  imageUrl: string | null;
  defaultPriceCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProductInput = Omit<Product, "id" | "createdAt" | "updatedAt">;
