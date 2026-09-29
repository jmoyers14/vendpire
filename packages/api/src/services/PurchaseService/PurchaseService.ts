import type { Purchase, PurchaseInput } from "@vendpire/platform";

export type { Purchase, PurchaseInput };

/** A line entered directly in sellable units. */
export interface PurchaseDraftLine {
  productId: string;
  units: number;
  totalCostCents: number;
  /**
   * Provenance when the line originated from a pack. Preserved across edits;
   * must reference an existing pack.
   */
  packId?: string | null;
}

/**
 * A line entered the way the receipt reads it — N packs for one total. The
 * service expands it into per-product unit lines, splitting the cost by unit
 * count, so every client submits packs identically and the math lives once.
 */
export interface PurchasePackLine {
  packId: string;
  /** How many of this pack were bought. */
  qty: number;
  /** Total paid for all `qty` packs. */
  totalCostCents: number;
}

/**
 * What a client submits. Distinct from PurchaseInput (what gets stored):
 * pack lines are expanded away before persistence, so the stored facts are
 * always per-product units with a total cost.
 */
export interface PurchaseDraft {
  purchasedAt: string;
  vendor: string;
  lines: PurchaseDraftLine[];
  packLines?: PurchasePackLine[];
  receiptTotalCents?: number | null;
  notes: string | null;
}

export interface PurchaseService {
  list(orgId: string): Promise<Purchase[]>;
  get(orgId: string, id: string): Promise<Purchase | null>;
  create(orgId: string, draft: PurchaseDraft): Promise<Purchase>;
  update(orgId: string, id: string, draft: PurchaseDraft): Promise<Purchase>;
  remove(orgId: string, id: string): Promise<void>;
}
