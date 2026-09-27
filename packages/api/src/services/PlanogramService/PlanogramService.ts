import type { Planogram, PlanogramInput } from "@vendpire/platform";

export type { Planogram, PlanogramInput };

export interface PlanogramService {
  listByMachine(orgId: string, machineId: string): Promise<Planogram[]>;
  getCurrent(orgId: string, machineId: string): Promise<Planogram | null>;
  /** Planograms are immutable versions: there is no update or remove. */
  create(orgId: string, input: PlanogramInput): Promise<Planogram>;
}
