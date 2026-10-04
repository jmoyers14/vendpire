import { Schema, model } from "mongoose";

/**
 * The raw inbound webhook, stored exactly as received and never mutated after
 * insert. This is the audit trail: if a handler has a bug, the event can be
 * replayed from here without asking the provider to redeliver.
 *
 * Deliberately NOT org-scoped, unlike every other collection in this app. The
 * tenant boundary can't apply here — `organization.created` is the event that
 * brings an org into existence, so it necessarily arrives before there's an
 * orgId to scope to. These are platform-infrastructure records, not tenant data.
 */
const webhookEventSchema = new Schema(
  {
    source: { type: String, required: true },
    // The provider's own id for this delivery (svix message id for Clerk).
    // Unique per source, which is what makes redelivery detectable.
    sourceEventId: { type: String, required: true },
    type: { type: String, required: true },
    // Stored as-is. Typed `unknown` at the repository boundary — nothing here
    // is trusted or reshaped until a handler claims it.
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: "receivedAt", updatedAt: false } },
);

// Providers retry on any non-2xx, so the same event WILL arrive more than once.
// The unique constraint is what makes ingestion idempotent; the repository
// upserts against it rather than checking-then-inserting, so two concurrent
// redeliveries can't both win.
webhookEventSchema.index({ source: 1, sourceEventId: 1 }, { unique: true });

export const WebhookEventModel = model("WebhookEvent", webhookEventSchema);
