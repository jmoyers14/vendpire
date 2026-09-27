import { inject, injectable } from "tsyringe";
import { PRODUCT_DATA_CLIENT_TOKEN } from "@vendpire/platform";
import type { ProductData, ProductDataClient } from "@vendpire/platform";
import type { ProductDataService } from "./ProductDataService.ts";

// GTINs are 8–14 digits; anything else can't be a barcode, so don't waste a
// provider call on it.
const GTIN_PATTERN = /^\d{8,14}$/;

/**
 * Catalog lookup logic: guard against non-barcode input, then delegate to the
 * provider port. The rest of the app never knows which catalog answers.
 */
@injectable()
export class ProductDataServiceImpl implements ProductDataService {
  constructor(
    @inject(PRODUCT_DATA_CLIENT_TOKEN)
    private readonly catalog: ProductDataClient,
  ) {}

  async lookup(upc: string): Promise<ProductData | null> {
    const trimmed = upc.trim();
    if (!GTIN_PATTERN.test(trimmed)) {
      return null;
    }
    return this.catalog.lookupByUpc(trimmed);
  }
}
