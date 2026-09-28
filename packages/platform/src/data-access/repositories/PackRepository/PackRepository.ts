import type { Pack, PackInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for packs. Org-scoped; deletes are soft and reads
 * exclude soft-deleted documents.
 */
export interface PackRepository {
  findByOrg(orgId: string): Promise<Pack[]>;
  findById(orgId: string, id: string): Promise<Pack | null>;
  findByBarcode(orgId: string, gtin14: string): Promise<Pack | null>;
  /** How many active packs reference a product in their contents. */
  countByProduct(orgId: string, productId: string): Promise<number>;
  create(orgId: string, data: PackInput): Promise<Pack>;
  update(orgId: string, id: string, data: PackInput): Promise<Pack | null>;
  softDelete(orgId: string, id: string): Promise<void>;
}
