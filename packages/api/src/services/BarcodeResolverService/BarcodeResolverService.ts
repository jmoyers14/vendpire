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
 *
 * The two "we don't know it" variants carry `likelyCase` so the setup UI can
 * open on the right answer: a native 14-digit code with an indicator digit of
 * 1–8 is a case code, which is most of what gets scanned at a warehouse club.
 */
export type BarcodeResolution =
  | { status: "product"; gtin14: string; product: Product }
  | { status: "pack"; gtin14: string; pack: Pack }
  | { status: "candidate"; gtin14: string; likelyCase: boolean; item: ProductData }
  | { status: "unknown"; gtin14: string; likelyCase: boolean }
  | { status: "invalid"; raw: string };

export interface BarcodeResolverService {
  resolve(orgId: string, raw: string): Promise<BarcodeResolution>;
}
