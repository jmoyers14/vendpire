/**
 * Purchase entity — one stock-buying run. Lines store the TOTAL cost, not a
 * unit cost: $14.99 / 30 doesn't divide evenly, and the total is what the
 * receipt says. Weighted-average unit cost is derived from these at read time.
 */
export interface PurchaseLine {
  productId: string;
  units: number;
  totalCostCents: number;
  /** Set when this line came from expanding a pack — provenance only. */
  packId: string | null;
}

export interface Purchase {
  id: string;
  purchasedAt: string;
  vendor: string;
  lines: PurchaseLine[];
  /** What the receipt says you paid, when recorded. Null when not entered. */
  receiptTotalCents: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseInput = Omit<Purchase, "id" | "createdAt" | "updatedAt">;

/**
 * A position in the purchases list. purchasedAt is NOT unique — several supply
 * runs share a date, and the web form stamps every purchase at local midday —
 * so a position is the PAIR (purchasedAt, id). Comparing dates alone would
 * re-show or skip every row sharing a date at a page boundary.
 */
export interface PurchaseCursor {
  /** Millisecond-precision ISO instant, exactly as `Purchase.purchasedAt`. */
  purchasedAt: string;
  /** 24-hex ObjectId; the tiebreaker, sorted in the same direction. */
  id: string;
}

export interface PurchaseListQuery {
  /** Inclusive lower bound on purchasedAt, as an ISO instant. */
  from?: string | null;
  /** Inclusive upper bound on purchasedAt, as an ISO instant. */
  to?: string | null;
  /** Rows to return. The repository reads one more to learn if more exist. */
  limit: number;
  /** Start STRICTLY AFTER this position in (purchasedAt desc, _id desc). */
  cursor?: PurchaseCursor | null;
}

export interface PurchasePage {
  items: Purchase[];
  /** At least one more row exists after `items`. */
  hasMore: boolean;
}
