import type { Purchase, PurchaseInput } from "@vendpire/platform";

export type { Purchase, PurchaseInput };

export interface PurchaseService {
  list(orgId: string): Promise<Purchase[]>;
  get(orgId: string, id: string): Promise<Purchase | null>;
  create(orgId: string, input: PurchaseInput): Promise<Purchase>;
  update(orgId: string, id: string, input: PurchaseInput): Promise<Purchase>;
  remove(orgId: string, id: string): Promise<void>;
}
