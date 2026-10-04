import { Schema, model } from "mongoose";

/**
 * A local mirror of a user held by the auth provider, kept in sync by the
 * `user.*` webhook handlers. The provider stays the source of truth for identity
 * — this exists so the app can join users to its own data and render a name or
 * avatar without a network call per request.
 *
 * Not org-scoped: a user is an identity, and in Clerk the same person can belong
 * to several organizations. Membership is OrganizationMembership's concern.
 */
const userSchema = new Schema(
  {
    // The provider's user id (Clerk's `user_xxx`). Named vendor-neutrally to
    // match the AuthClient port — nothing outside the Clerk adapter should know
    // which provider issued it.
    authUserId: { type: String, required: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    firstName: { type: String, default: null, trim: true },
    lastName: { type: String, default: null, trim: true },
    imageUrl: { type: String, default: null },
  },
  { timestamps: true },
);

// Webhooks arrive out of order and more than once, so sync is an upsert against
// this key rather than an insert.
userSchema.index({ authUserId: 1 }, { unique: true });
// Sync pull: "every user changed since the last sync" — the iOS client's shape.
userSchema.index({ updatedAt: -1 });

export const UserModel = model("User", userSchema);
