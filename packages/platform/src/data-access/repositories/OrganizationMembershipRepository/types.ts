/**
 * Who belongs to which business, and in what role. Plain data, free of Mongoose
 * types.
 */
export interface OrganizationMembership {
  id: string;
  orgId: string;
  /** The provider's user id, matching User.authUserId. */
  authUserId: string;
  /** Clerk's role string, e.g. "org:admin". Stored verbatim. */
  role: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields carried by a membership sync; (orgId, authUserId) is the upsert key. */
export type OrganizationMembershipInput = Omit<
  OrganizationMembership,
  "id" | "createdAt" | "updatedAt"
>;
