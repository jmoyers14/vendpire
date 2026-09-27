/**
 * Vendor-neutral shape of an external product-catalog record, keyed by barcode.
 */
export interface ProductData {
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

/**
 * Port for a product-catalog provider. Named by capability, not vendor —
 * Open Food Facts sits behind it today; a paid catalog could replace it
 * without touching a service. Returns null when the barcode isn't known.
 */
export interface ProductDataClient {
  lookupByUpc(upc: string): Promise<ProductData | null>;
}
