/**
 * Product entity — plain data, free of Mongoose types. Unit cost is NOT a
 * field: it's derived from purchases as a weighted average.
 */
export interface Product {
  id: string;
  name: string;
  upc: string | null;
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
