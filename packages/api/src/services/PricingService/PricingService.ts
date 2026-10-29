/**
 * What one product cost to buy LAST, and what to charge for it.
 *
 * Units and total are kept apart rather than pre-divided, exactly as
 * `ReplacementCost` does, so a client can derive markup and margin against any
 * candidate price without a rounded unit cost in the middle.
 */
export interface ProductPricing {
  productId: string;
  units: number;
  totalCostCents: number;
  purchasedAt: string;
  vendor: string;
  /** `TARGET_MARKUP` x replacement cost, rounded up to a price point. */
  suggestedPriceCents: number;
}

export interface PricingService {
  /**
   * Pricing for every product that has been purchased at least once.
   *
   * Products with no purchase history are ABSENT rather than present with
   * nulls — there is nothing to say about them, and the caller's join turning
   * up nothing is what puts a dash on screen instead of a $0.00 suggestion.
   */
  list(orgId: string): Promise<ProductPricing[]>;
}
