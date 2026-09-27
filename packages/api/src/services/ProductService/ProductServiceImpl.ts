import { inject, injectable } from "tsyringe";
import {
  PLANOGRAM_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
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
  ) {}

  list(orgId: string): Promise<Product[]> {
    return this.products.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Product | null> {
    return this.products.findById(orgId, id);
  }

  async create(orgId: string, input: ProductInput): Promise<Product> {
    return this.products.create(orgId, normalize(input));
  }

  async update(
    orgId: string,
    id: string,
    input: ProductInput,
  ): Promise<Product> {
    const updated = await this.products.update(orgId, id, normalize(input));
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Product not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
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
