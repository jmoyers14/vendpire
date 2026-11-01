import type { Cents, ReplacementCost } from "@vendpire/domain";

/** What one product cost to buy last, and what to charge for it. */
export interface ProductPricing extends ReplacementCost {
  productId: string;
  /** `TARGET_MARKUP` x replacement cost, rounded up. Null for a free product. */
  suggestedPriceCents: Cents | null;
}

export interface PricingService {
  /** Only products purchased at least once; others are absent, not zeroed. */
  list(orgId: string): Promise<ProductPricing[]>;
}
