import { inject, injectable } from "tsyringe";
import { PRODUCT_DATA_CLIENT_TOKEN } from "@vendpire/platform";
import type {
  ProductData,
  ProductDataClient,
  ProductSearchResult,
} from "@vendpire/platform";
import type { ProductDataService } from "./ProductDataService.ts";

// GTINs are 8–14 digits; anything else can't be a barcode, so don't waste a
// provider call on it.
const GTIN_PATTERN = /^\d{8,14}$/;

// Below this many characters a text query is too vague to be worth a
// provider call, so we short-circuit to no results.
const MIN_QUERY_LENGTH = 3;

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

  async search(query: string): Promise<ProductSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return [];
    }
    return this.catalog.searchByName(trimmed);
  }
}
