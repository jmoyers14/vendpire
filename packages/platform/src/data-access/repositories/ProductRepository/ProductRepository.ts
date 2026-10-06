import type { Product, ProductInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for products. Org-scoped; deletes are soft and reads
 * exclude soft-deleted documents.
 */
export interface ProductRepository {
  findByOrg(orgId: string): Promise<Product[]>;
  findById(orgId: string, id: string): Promise<Product | null>;
  findByUpc(orgId: string, upc: string): Promise<Product | null>;
  /** Which of `ids` exist (and aren't deleted) — for validating references. */
  findExistingIds(orgId: string, ids: string[]): Promise<Set<string>>;
  /**
   * Which of `ids` exist as documents in this org, IGNORING `deletedAt`.
   *
   * For validating references on an append-only record captured in the field.
   * A phone counts a slot, someone soft-deletes that product in the dashboard,
   * and the outbox submits hours later: a `findExistingIds` check would 400
   * that submission PERMANENTLY, and the day's counts are gone with no way to
   * get them back. A soft-deleted product is still a real product that was
   * really in the machine.
   */
  findExistingIdsIncludingDeleted(
    orgId: string,
    ids: string[],
  ): Promise<Set<string>>;
  create(orgId: string, data: ProductInput): Promise<Product>;
  update(orgId: string, id: string, data: ProductInput): Promise<Product | null>;
  softDelete(orgId: string, id: string): Promise<void>;
}
