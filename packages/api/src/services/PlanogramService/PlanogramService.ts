import type { Planogram, PlanogramInput } from "@vendpire/platform";

export type { Planogram, PlanogramInput };

export interface PlanogramService {
  listByMachine(orgId: string, machineId: string): Promise<Planogram[]>;
  getCurrent(orgId: string, machineId: string): Promise<Planogram | null>;
  /**
   * The current version of EVERY machine in the org, in one read. What a client
   * mirroring the org needs: a per-machine round trip would be a request per
   * machine on a route.
   */
  listCurrentByOrg(orgId: string): Promise<Planogram[]>;
  /** Planograms are immutable versions: there is no update or remove. */
  create(orgId: string, input: PlanogramInput): Promise<Planogram>;
}
