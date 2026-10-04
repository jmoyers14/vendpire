/**
 * Which provider sent a webhook. A union rather than a bare string so adding a
 * source is a deliberate, type-checked act — the compiler points at every
 * routing and verification site that has to learn about it.
 *
 * Clerk is the only source today. This type is the shared vocabulary for both
 * the webhook repository and the verifier port, which is why it's declared here
 * (with the event record, the first thing every source produces) rather than
 * duplicated per consumer.
 */
export type WebhookSource = "clerk";

/**
 * A raw inbound webhook as persisted — plain data, free of Mongoose types.
 */
export interface WebhookEvent {
  id: string;
  source: WebhookSource;
  /** The provider's id for this delivery — unique per source. */
  sourceEventId: string;
  /** The provider's event name, e.g. "organization.created". */
  type: string;
  /**
   * The body exactly as it arrived. `unknown` on purpose: it's attacker-shaped
   * data until a handler validates it, and the type system should force that
   * step rather than let a handler assume a shape.
   */
  payload: unknown;
  receivedAt: string;
}

/** Fields supplied at ingestion; id/receivedAt are server-managed. */
export type WebhookEventInput = Omit<WebhookEvent, "id" | "receivedAt">;

/**
 * Result of recording an event. `alreadySeen` distinguishes a first delivery
 * from a provider retry — available for logging and operational insight even
 * though ingestion deliberately does not branch on it.
 */
export interface RecordedWebhookEvent {
  event: WebhookEvent;
  alreadySeen: boolean;
}
