import { inject, injectable } from "tsyringe";
import { normalizeGtin } from "@vendpire/domain";
import {
  PACK_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  Pack,
  PackInput,
  PackRepository,
  ProductRepository,
} from "@vendpire/platform";
import { ServiceError } from "../errors.ts";
import type { PackService } from "./PackService.ts";

/**
 * Pack business rules: barcodes are validated + normalized to GTIN-14 and
 * must be unique within the org — across packs AND against product unit
 * upcs (one code can never mean both a case and a can). Contents must
 * reference existing products, each product at most once.
 */
@injectable()
export class PackServiceImpl implements PackService {
  constructor(
    @inject(PACK_REPOSITORY_TOKEN)
    private readonly packs: PackRepository,
    @inject(PRODUCT_REPOSITORY_TOKEN)
    private readonly products: ProductRepository,
  ) {}

  list(orgId: string): Promise<Pack[]> {
    return this.packs.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Pack | null> {
    return this.packs.findById(orgId, id);
  }

  async create(orgId: string, input: PackInput): Promise<Pack> {
    const data = await this.validate(orgId, input, null);
    return this.packs.create(orgId, data);
  }

  async update(orgId: string, id: string, input: PackInput): Promise<Pack> {
    const data = await this.validate(orgId, input, id);
    const updated = await this.packs.update(orgId, id, data);
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Pack not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.packs.softDelete(orgId, id);
  }

  private async validate(
    orgId: string,
    input: PackInput,
    excludeId: string | null,
  ): Promise<PackInput> {
    if (input.contents.length === 0) {
      throw new ServiceError("BAD_REQUEST", "A pack needs at least one product");
    }
    const productIds = input.contents.map((content) => content.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new ServiceError("BAD_REQUEST", "Duplicate products in pack contents");
    }
    const existing = await this.products.findExistingIds(orgId, productIds);
    const missing = productIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new ServiceError(
        "BAD_REQUEST",
        `Unknown product(s): ${missing.join(", ")}`,
      );
    }

    const barcodes: string[] = [];
    for (const raw of input.barcodes) {
      const normalized = normalizeGtin(raw);
      if (!normalized) {
        throw new ServiceError("BAD_REQUEST", `Invalid barcode: ${raw}`);
      }
      const gtin14 = normalized.gtin14;
      if (barcodes.includes(gtin14)) {
        continue;
      }
      const packWithCode = await this.packs.findByBarcode(orgId, gtin14);
      if (packWithCode && packWithCode.id !== excludeId) {
        throw new ServiceError(
          "CONFLICT",
          `Barcode ${gtin14} is already on pack "${packWithCode.name}"`,
        );
      }
      const productWithCode = await this.products.findByUpc(orgId, gtin14);
      if (productWithCode) {
        throw new ServiceError(
          "CONFLICT",
          `Barcode ${gtin14} is the unit code of "${productWithCode.name}"`,
        );
      }
      barcodes.push(gtin14);
    }

    return {
      name: input.name.trim(),
      barcodes,
      contents: input.contents,
      active: input.active,
    };
  }
}
