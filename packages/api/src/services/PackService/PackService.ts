import type { Pack, PackInput } from "@vendpire/platform";

export type { Pack, PackInput };

export interface PackService {
  list(orgId: string): Promise<Pack[]>;
  get(orgId: string, id: string): Promise<Pack | null>;
  create(orgId: string, input: PackInput): Promise<Pack>;
  update(orgId: string, id: string, input: PackInput): Promise<Pack>;
  remove(orgId: string, id: string): Promise<void>;
}
