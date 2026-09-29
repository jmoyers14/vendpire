import { inject, injectable } from "tsyringe";
import { normalizeGtin } from "@vendpire/domain";
import {
  PACK_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type { PackRepository, ProductRepository } from "@vendpire/platform";
import { PRODUCT_DATA_SERVICE_TOKEN } from "../tokens.ts";
import type { ProductDataService } from "../ProductDataService/ProductDataService.ts";
import type {
  BarcodeResolution,
  BarcodeResolverService,
} from "./BarcodeResolverService.ts";

/**
 * Turns a raw barcode into "what is this?" for purchase entry (and, later,
 * the iOS scanner). Every code is normalized to GTIN-14 first, so a UPC-E off
 * a small can and the zero-padded EAN-13 off a receipt resolve to the same
 * thing. An outside catalog is only consulted when we don't already know the
 * code — confirmed knowledge always wins.
 */
@injectable()
export class BarcodeResolverServiceImpl implements BarcodeResolverService {
  constructor(
    @inject(PRODUCT_REPOSITORY_TOKEN)
    private readonly products: ProductRepository,
    @inject(PACK_REPOSITORY_TOKEN)
    private readonly packs: PackRepository,
    @inject(PRODUCT_DATA_SERVICE_TOKEN)
    private readonly catalog: ProductDataService,
  ) {}

  async resolve(orgId: string, raw: string): Promise<BarcodeResolution> {
    const normalized = normalizeGtin(raw);
    if (!normalized) {
      return { status: "invalid", raw };
    }
    const gtin14 = normalized.gtin14;

    const product = await this.products.findByUpc(orgId, gtin14);
    if (product) {
      return { status: "product", gtin14, product };
    }

    const pack = await this.packs.findByBarcode(orgId, gtin14);
    if (pack) {
      return { status: "pack", gtin14, pack };
    }

    // An outside catalog can name the item but never tells us what it means
    // for this business — the caller decides whether it's a unit or a case.
    // A provider outage must not look like "unknown barcode", but it also
    // shouldn't block entry, so fall through to unknown on failure.
    try {
      const item = await this.catalog.lookup(gtin14);
      if (item) {
        return { status: "candidate", gtin14, item };
      }
    } catch {
      // fall through
    }

    return { status: "unknown", gtin14 };
  }
}
