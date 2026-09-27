import { injectable } from "tsyringe";
import type { ProductData, ProductDataClient } from "./ProductDataClient.ts";

const BASE_URL = "https://world.openfoodfacts.org/api/v2/product";
// Open Food Facts asks API users to identify themselves via User-Agent.
const USER_AGENT = "vendpire/0.1 (vending route tracker; personal use)";

// The slice of the OFF v2 response we actually read.
interface OffResponse {
  status?: number;
  product?: {
    product_name?: string;
    brands?: string;
    image_front_url?: string;
    image_url?: string;
  };
}

/**
 * Open Food Facts adapter for the ProductDataClient port — free, keyless,
 * community data (ODbL; images CC-BY-SA). The only file that knows OFF's URL
 * or response shape. Not-found is null; transport failures throw so a provider
 * outage doesn't masquerade as "unknown barcode".
 */
@injectable()
export class OpenFoodFactsClient implements ProductDataClient {
  async lookupByUpc(upc: string): Promise<ProductData | null> {
    const direct = await this.fetchProduct(upc);
    if (direct) {
      return direct;
    }
    // US UPC-A is 12 digits; OFF often stores it as 13-digit EAN with a
    // leading zero. Retry the padded form before giving up.
    if (/^\d{12}$/.test(upc)) {
      return this.fetchProduct(`0${upc}`);
    }
    return null;
  }

  private async fetchProduct(barcode: string): Promise<ProductData | null> {
    const res = await fetch(
      `${BASE_URL}/${encodeURIComponent(barcode)}?fields=product_name,brands,image_front_url,image_url`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Open Food Facts lookup failed (${res.status})`);
    }
    const json = (await res.json()) as OffResponse;
    if (json.status !== 1 || !json.product) {
      return null;
    }
    const clean = (value: string | undefined): string | null => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };
    return {
      name: clean(json.product.product_name),
      brand: clean(json.product.brands),
      imageUrl: clean(json.product.image_front_url) ?? clean(json.product.image_url),
    };
  }
}
