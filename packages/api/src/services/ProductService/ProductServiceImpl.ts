import { inject, injectable } from "tsyringe";
import { normalizeGtin } from "@vendpire/domain";
import {
  PACK_REPOSITORY_TOKEN,
  PLANOGRAM_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  PackRepository,
  PlanogramRepository,
  Product,
  ProductInput,
  ProductRepository,
} from "@vendpire/platform";
import { ServiceError } from "../errors.ts";
import type { ProductService } from "./ProductService.ts";

/**
 * Product business rules: normalize text fields, and block removing a product
 * that a machine is CURRENTLY selling (present in any machine's latest
 * planogram version). Products only in historical versions can go — soft
 * delete keeps them resolvable for past-data reads.
 */
@injectable()
export class ProductServiceImpl implements ProductService {
  constructor(
    @inject(PRODUCT_REPOSITORY_TOKEN)
    private readonly products: ProductRepository,
    @inject(PLANOGRAM_REPOSITORY_TOKEN)
    private readonly planograms: PlanogramRepository,
    @inject(PACK_REPOSITORY_TOKEN)
    private readonly packs: PackRepository,
  ) {}

  list(orgId: string): Promise<Product[]> {
    return this.products.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Product | null> {
    return this.products.findById(orgId, id);
  }

  async create(orgId: string, input: ProductInput): Promise<Product> {
    return this.products.create(orgId, await this.validate(orgId, input, null));
  }

  async update(
    orgId: string,
    id: string,
    input: ProductInput,
  ): Promise<Product> {
    const updated = await this.products.update(
      orgId,
      id,
      await this.validate(orgId, input, id),
    );
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Product not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
    const packCount = await this.packs.countByProduct(orgId, id);
    if (packCount > 0) {
      throw new ServiceError(
        "CONFLICT",
        `Product is inside ${packCount} pack(s); remove it from them first`,
      );
    }
    const current = await this.planograms.findCurrentByOrg(orgId);
    const inUse = current.some((planogram) =>
      planogram.slots.some((slot) => slot.productId === id),
    );
    if (inUse) {
      throw new ServiceError(
        "CONFLICT",
        "Product is in a machine's current planogram; swap it out first",
      );
    }
    await this.products.softDelete(orgId, id);
  }

  /**
   * The unit upc, when present, is validated + normalized to GTIN-14 and must
   * be unique — across products AND against pack barcodes (one code can never
   * mean both a can and a case).
   */
  private async validate(
    orgId: string,
    input: ProductInput,
    excludeId: string | null,
  ): Promise<ProductInput> {
    const data = normalize(input);
    if (data.upc !== null) {
      const normalized = normalizeGtin(data.upc);
      if (!normalized) {
        throw new ServiceError("BAD_REQUEST", `Invalid barcode: ${data.upc}`);
      }
      data.upc = normalized.gtin14;
      const productWithCode = await this.products.findByUpc(orgId, data.upc);
      if (productWithCode && productWithCode.id !== excludeId) {
        throw new ServiceError(
          "CONFLICT",
          `Barcode ${data.upc} is already on "${productWithCode.name}"`,
        );
      }
      const packWithCode = await this.packs.findByBarcode(orgId, data.upc);
      if (packWithCode) {
        throw new ServiceError(
          "CONFLICT",
          `Barcode ${data.upc} is the case code of pack "${packWithCode.name}"`,
        );
      }
    }
    return data;
  }
}

function normalize(input: ProductInput): ProductInput {
  const clean = (value: string | null): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  return {
    name: input.name.trim(),
    upc: clean(input.upc),
    category: input.category.trim(),
    taxClass: clean(input.taxClass),
    imageUrl: clean(input.imageUrl),
    defaultPriceCents: input.defaultPriceCents,
    active: input.active,
  };
}
