import { Schema, model } from "mongoose";

/**
 * A local mirror of the Clerk organization, which in vendpire IS the business —
 * the tenant every other collection is scoped to. Kept in sync by the
 * `organization.*` webhook handlers.
 *
 * Clerk stays the source of truth for the org's identity and membership; this
 * copy exists so the app can render the business name and hang business-level
 * settings off a real document without a Clerk API call per request.
 */
const organizationSchema = new Schema(
  {
    // The Clerk org id. This IS the app's tenant key — the same string every
    // other collection carries as `orgId` — so it's unique here rather than an
    // ordinary scoping index.
    orgId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, default: null, trim: true },
    imageUrl: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

organizationSchema.index({ orgId: 1 }, { unique: true });
// Sync pull: "everything changed since last sync".
organizationSchema.index({ updatedAt: -1 });

export const OrganizationModel = model("Organization", organizationSchema);
