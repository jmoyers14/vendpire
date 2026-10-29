import { inject, injectable } from "tsyringe";
import { buildReplacementCosts, suggestedPriceCents } from "@vendpire/domain";
import { PURCHASE_REPOSITORY_TOKEN } from "@vendpire/platform";
import type { PurchaseRepository } from "@vendpire/platform";
import type { PricingService, ProductPricing } from "./PricingService.ts";

/**
 * Turns purchase history into a suggested sell price. Reads purchases only —
 * the caller joins to products by id, so this never needs the catalog.
 */
@injectable()
export class PricingServiceImpl implements PricingService {
  constructor(
    @inject(PURCHASE_REPOSITORY_TOKEN)
    private readonly purchases: PurchaseRepository,
  ) {}

  async list(orgId: string): Promise<ProductPricing[]> {
    const lines = await this.purchases.findReplacementCostLines(orgId);
    const costs = buildReplacementCosts(lines);

    return [...costs].map(([productId, cost]) => ({
      productId,
      units: cost.units,
      totalCostCents: cost.totalCostCents,
      purchasedAt: cost.purchasedAt,
      vendor: cost.vendor,
      suggestedPriceCents: suggestedPriceCents(cost),
    }));
  }
}
