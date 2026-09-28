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
  create(orgId: string, data: ProductInput): Promise<Product>;
  update(orgId: string, id: string, data: ProductInput): Promise<Product | null>;
  softDelete(orgId: string, id: string): Promise<void>;
}
