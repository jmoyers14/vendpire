import type {
  Purchase,
  PurchaseCursor,
  PurchaseInput,
  PurchaseUpdate,
} from "@vendpire/platform";

export type { Purchase, PurchaseCursor, PurchaseInput, PurchaseUpdate };

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
  /** Client-minted idempotency key, minted once per form/draft. */
  clientRequestId: string;
}

/**
 * What an edit submits — everything except the key. An edit cannot change it:
 * rewriting the key would strand the one the submitting client still retries
 * under, and that retry would create a second purchase instead of getting this
 * one back.
 */
export type PurchaseEditDraft = Omit<PurchaseDraft, "clientRequestId">;

/**
 * Page size when the caller doesn't say. There is deliberately no maximum:
 * the page plus "Load more" is the bound, not a cap that would silently
 * truncate somebody's history.
 */
export const DEFAULT_PURCHASE_PAGE_SIZE = 50;

export interface PurchaseListOptions {
  /** Inclusive ISO instant bounds on purchasedAt. */
  from?: string | null;
  to?: string | null;
  limit?: number;
  /** Opaque cursor from a previous page's nextCursor. */
  cursor?: string | null;
}

export interface PurchaseListPage {
  items: Purchase[];
  /** Pass back as `cursor` for the next page. Null means this was the last. */
  nextCursor: string | null;
}

export interface PurchaseService {
  list(orgId: string, options: PurchaseListOptions): Promise<PurchaseListPage>;
  get(orgId: string, id: string): Promise<Purchase | null>;
  create(orgId: string, draft: PurchaseDraft): Promise<Purchase>;
  update(orgId: string, id: string, draft: PurchaseEditDraft): Promise<Purchase>;
  remove(orgId: string, id: string): Promise<void>;
}
