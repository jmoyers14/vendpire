/**
 * Vendor-neutral shape of an external product-catalog record, keyed by barcode.
 */
export interface ProductData {
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

/** One text-search hit — like ProductData but carrying its barcode. */
export interface ProductSearchResult {
  upc: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

/**
 * Port for a product-catalog provider. Named by capability, not vendor —
 * Open Food Facts sits behind it today; a paid catalog could replace it
 * without touching a service. `lookupByUpc` returns null when the barcode
 * isn't known; `searchByName` returns ranked matches for a text query.
 */
export interface ProductDataClient {
  lookupByUpc(upc: string): Promise<ProductData | null>;
  searchByName(query: string): Promise<ProductSearchResult[]>;
}
