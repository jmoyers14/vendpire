import type { Pack, Product, ProductData } from "@vendpire/platform";

/**
 * What a scanned or typed barcode turned out to be. Resolution order is
 * "what we already know" first, so a code the operator has confirmed once is
 * never re-litigated against an outside service:
 *
 *   own product upc → own pack barcode → external catalog → unknown
 *
 * `candidate` means an outside catalog recognised the code but we have no
 * product for it yet — the caller offers to create one, prefilled.
 */
export type BarcodeResolution =
  | { status: "product"; gtin14: string; product: Product }
  | { status: "pack"; gtin14: string; pack: Pack }
  | { status: "candidate"; gtin14: string; item: ProductData }
  | { status: "unknown"; gtin14: string }
  | { status: "invalid"; raw: string };

export interface BarcodeResolverService {
  resolve(orgId: string, raw: string): Promise<BarcodeResolution>;
}
