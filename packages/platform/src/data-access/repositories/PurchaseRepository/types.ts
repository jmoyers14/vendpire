/**
 * Purchase entity — one stock-buying run. Lines store the TOTAL cost, not a
 * unit cost: $14.99 / 30 doesn't divide evenly, and the total is what the
 * receipt says. Weighted-average unit cost is derived from these at read time.
 */
export interface PurchaseLine {
  productId: string;
  units: number;
  totalCostCents: number;
}

export interface Purchase {
  id: string;
  purchasedAt: string;
  vendor: string;
  lines: PurchaseLine[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseInput = Omit<Purchase, "id" | "createdAt" | "updatedAt">;
