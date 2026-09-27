import type { ProductData, ProductSearchResult } from "@vendpire/platform";

export type { ProductData, ProductSearchResult };

/**
 * External product-catalog lookup, backing the "Look up" button next to the
 * UPC field: returns name/brand/image for a barcode, or null when unknown.
 */
export interface ProductDataService {
  lookup(upc: string): Promise<ProductData | null>;
  search(query: string): Promise<ProductSearchResult[]>;
}
