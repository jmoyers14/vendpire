import type { Planogram, PlanogramInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for planogram versions. Create-only by design —
 * planograms are immutable; there is no update. Org-scoped.
 */
export interface PlanogramRepository {
  /** All versions for a machine, newest effectiveFrom first. */
  findByMachine(orgId: string, machineId: string): Promise<Planogram[]>;
  /** The version in effect now (latest effectiveFrom) for a machine. */
  findCurrentByMachine(orgId: string, machineId: string): Promise<Planogram | null>;
  /** The current version of EVERY machine — for cross-machine reference checks. */
  findCurrentByOrg(orgId: string): Promise<Planogram[]>;
  countByMachine(orgId: string, machineId: string): Promise<number>;
  create(orgId: string, data: PlanogramInput): Promise<Planogram>;
}
