import { Schema, model } from "mongoose";

/**
 * Who belongs to which business, and in what role. Mirrored from Clerk by the
 * `organizationMembership.*` webhook handlers.
 *
 * NOT an authorization source. `orgRole` already rides on the session token and
 * orgProtectedProcedure reads it from there, which is always current; a webhook
 * mirror can lag. This record exists so the app can *list* an org's members
 * without a Clerk API call.
 */
const organizationMembershipSchema = new Schema(
  {
    orgId: { type: String, required: true },
    // The provider's user id, matching User.authUserId.
    authUserId: { type: String, required: true },
    // Clerk's role string, e.g. "org:admin" / "org:member". Stored verbatim
    // rather than mapped to a local enum, so a new Clerk role doesn't need a
    // migration to be recorded.
    role: { type: String, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One membership per (org, user). Sync is an upsert against this key, since
// created/updated can arrive out of order or be redelivered.
organizationMembershipSchema.index({ orgId: 1, authUserId: 1 }, { unique: true });
organizationMembershipSchema.index({ orgId: 1, updatedAt: -1 });

export const OrganizationMembershipModel = model(
  "OrganizationMembership",
  organizationMembershipSchema,
);
