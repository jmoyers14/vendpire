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
  findExistingIdsIncludingDeleted(
    orgId: string,
    ids: string[],
  ): Promise<Set<string>>;
  /**
   * Full products by id, INCLUDING soft-deleted ones. The expiry report needs
   * a retired product's name and tracking flag: a product pulled from the
   * catalog but still sitting in a machine is exactly the stock most likely to
   * go bad, and omitting its row would hide it.
   */
  findByIdsIncludingDeleted(orgId: string, ids: string[]): Promise<Product[]>;
  create(orgId: string, data: ProductInput): Promise<Product>;
  update(orgId: string, id: string, data: ProductInput): Promise<Product | null>;
  softDelete(orgId: string, id: string): Promise<void>;
}
