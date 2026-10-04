import type {
  OrganizationMembership,
  OrganizationMembershipInput,
} from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for the local membership mirror.
 *
 * Read-only as far as the app is concerned — the only writer is the
 * `organizationMembership.*` webhook handler. Not an authorization source: see
 * the model for why the session token's `orgRole` remains the one to check.
 */
export interface OrganizationMembershipRepository {
  /**
   * Creates or updates one membership. An upsert on (orgId, authUserId) because
   * created/updated can arrive out of order or be redelivered.
   */
  upsertByOrgAndUser(
    input: OrganizationMembershipInput,
  ): Promise<OrganizationMembership>;
  /** An org's current roster, for member lists. */
  findByOrg(orgId: string): Promise<OrganizationMembership[]>;
  /** Every org one identity belongs to. */
  findByUser(authUserId: string): Promise<OrganizationMembership[]>;
  /**
   * Soft-deletes one membership, for `organizationMembership.deleted`. Soft so a
   * future sync pull can tell a client the membership went away.
   */
  softDeleteByOrgAndUser(orgId: string, authUserId: string): Promise<void>;
}
