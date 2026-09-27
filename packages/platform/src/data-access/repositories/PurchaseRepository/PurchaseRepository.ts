import type { Purchase, PurchaseInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for purchases. Org-scoped; deletes are soft and reads
 * exclude soft-deleted documents.
 */
export interface PurchaseRepository {
  findByOrg(orgId: string): Promise<Purchase[]>;
  findById(orgId: string, id: string): Promise<Purchase | null>;
  create(orgId: string, data: PurchaseInput): Promise<Purchase>;
  update(orgId: string, id: string, data: PurchaseInput): Promise<Purchase | null>;
  softDelete(orgId: string, id: string): Promise<void>;
}
