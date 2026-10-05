import type {
  Purchase,
  PurchaseInput,
  PurchaseListQuery,
  PurchasePage,
} from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for purchases. Org-scoped; deletes are soft and reads
 * exclude soft-deleted documents.
 */
export interface PurchaseRepository {
  /**
   * One page of the org's purchases, newest first, keyed on
   * (purchasedAt desc, _id desc). Replaces an unbounded findByOrg: this is the
   * only list in the app that grows without limit.
   */
  findPageByOrg(orgId: string, query: PurchaseListQuery): Promise<PurchasePage>;
  findById(orgId: string, id: string): Promise<Purchase | null>;
  create(orgId: string, data: PurchaseInput): Promise<Purchase>;
  update(orgId: string, id: string, data: PurchaseInput): Promise<Purchase | null>;
  softDelete(orgId: string, id: string): Promise<void>;
}
