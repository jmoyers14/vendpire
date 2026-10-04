import type { MachineTemplate, MachineTemplateInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for machine templates. Org-scoped; deletes are soft and
 * reads exclude soft-deleted documents. There is no findByName — name
 * uniqueness is case-insensitive, which an index can't serve without matching
 * collation, so the service compares over findByOrg.
 */
export interface MachineTemplateRepository {
  findByOrg(orgId: string): Promise<MachineTemplate[]>;
  findById(orgId: string, id: string): Promise<MachineTemplate | null>;
  create(orgId: string, data: MachineTemplateInput): Promise<MachineTemplate>;
  update(
    orgId: string,
    id: string,
    data: MachineTemplateInput,
  ): Promise<MachineTemplate | null>;
  softDelete(orgId: string, id: string): Promise<void>;
}
