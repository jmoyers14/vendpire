import type { Machine, MachineInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for machines. Org-scoped; deletes are soft and reads
 * exclude soft-deleted documents.
 */
export interface MachineRepository {
  findByOrg(orgId: string): Promise<Machine[]>;
  findById(orgId: string, id: string): Promise<Machine | null>;
  findByTagCode(orgId: string, tagCode: string): Promise<Machine | null>;
  countByLocation(orgId: string, locationId: string): Promise<number>;
  create(orgId: string, data: MachineInput): Promise<Machine>;
  update(orgId: string, id: string, data: MachineInput): Promise<Machine | null>;
  softDelete(orgId: string, id: string): Promise<void>;
}
