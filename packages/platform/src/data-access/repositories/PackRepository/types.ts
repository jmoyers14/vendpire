/**
 * Pack entity — a purchasable configuration of products (case, box, variety
 * pack). Plain data, free of Mongoose types.
 */
export interface PackContent {
  productId: string;
  /** Sellable units of this product inside one pack. */
  units: number;
}

export interface Pack {
  id: string;
  name: string;
  /** Case-level barcodes, normalized to GTIN-14. */
  barcodes: string[];
  contents: PackContent[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PackInput = Omit<Pack, "id" | "createdAt" | "updatedAt">;
