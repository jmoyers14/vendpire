import type { Organization, OrganizationInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for the local organization mirror.
 *
 * Unlike the tenant collections, methods here take the orgId as the *identity*
 * of the row rather than as a scope filter — this collection has exactly one
 * document per tenant.
 */
export interface OrganizationRepository {
  /**
   * Creates or updates the mirror for one Clerk organization. An upsert because
   * `organization.created` and `organization.updated` can arrive out of order or
   * be redelivered; sync must converge from any starting state.
   */
  upsertByOrgId(input: OrganizationInput): Promise<Organization>;
  findByOrgId(orgId: string): Promise<Organization | null>;
  /**
   * Soft-deletes the mirror. Soft rather than hard so a future sync pull can
   * still tell a client the org went away, matching the convention the tenant
   * collections use.
   */
  softDeleteByOrgId(orgId: string): Promise<void>;
}
