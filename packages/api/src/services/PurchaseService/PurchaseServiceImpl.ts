import { inject, injectable } from "tsyringe";
import {
  PRODUCT_REPOSITORY_TOKEN,
  PURCHASE_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  ProductRepository,
  Purchase,
  PurchaseInput,
  PurchaseRepository,
} from "@vendpire/platform";
import { ServiceError } from "../errors.ts";
import type { PurchaseService } from "./PurchaseService.ts";

/**
 * Purchase business rules: a purchase needs at least one line, and every line
 * must reference an existing product — the weighted-average cost calculation
 * downstream can't price units of a product that was never defined.
 */
@injectable()
export class PurchaseServiceImpl implements PurchaseService {
  constructor(
    @inject(PURCHASE_REPOSITORY_TOKEN)
    private readonly purchases: PurchaseRepository,
    @inject(PRODUCT_REPOSITORY_TOKEN)
    private readonly products: ProductRepository,
  ) {}

  list(orgId: string): Promise<Purchase[]> {
    return this.purchases.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Purchase | null> {
    return this.purchases.findById(orgId, id);
  }

  async create(orgId: string, input: PurchaseInput): Promise<Purchase> {
    return this.purchases.create(orgId, await this.validate(orgId, input));
  }

  async update(
    orgId: string,
    id: string,
    input: PurchaseInput,
  ): Promise<Purchase> {
    const updated = await this.purchases.update(
      orgId,
      id,
      await this.validate(orgId, input),
    );
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Purchase not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.purchases.softDelete(orgId, id);
  }

  private async validate(
    orgId: string,
    input: PurchaseInput,
  ): Promise<PurchaseInput> {
    if (input.lines.length === 0) {
      throw new ServiceError("BAD_REQUEST", "A purchase needs at least one line");
    }
    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const existing = await this.products.findExistingIds(orgId, productIds);
    const missing = productIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new ServiceError(
        "BAD_REQUEST",
        `Unknown product(s): ${missing.join(", ")}`,
      );
    }
    const notes = input.notes?.trim();
    return {
      purchasedAt: input.purchasedAt,
      vendor: input.vendor.trim(),
      lines: input.lines,
      notes: notes ? notes : null,
    };
  }
}
