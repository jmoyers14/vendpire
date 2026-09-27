import type { Product, ProductInput } from "@vendpire/platform";

export type { Product, ProductInput };

export interface ProductService {
  list(orgId: string): Promise<Product[]>;
  get(orgId: string, id: string): Promise<Product | null>;
  create(orgId: string, input: ProductInput): Promise<Product>;
  update(orgId: string, id: string, input: ProductInput): Promise<Product>;
  remove(orgId: string, id: string): Promise<void>;
}
