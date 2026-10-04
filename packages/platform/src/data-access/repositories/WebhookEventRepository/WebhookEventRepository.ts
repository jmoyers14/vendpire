import type {
  RecordedWebhookEvent,
  WebhookEvent,
  WebhookEventInput,
  WebhookSource,
} from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for raw inbound webhooks. Not org-scoped — see the model
 * for why the tenant rule can't apply to this collection.
 */
export interface WebhookEventRepository {
  /**
   * Records a delivery, or reports that it was already recorded. Idempotent and
   * race-safe: implemented as an upsert on (source, sourceEventId), so two
   * concurrent redeliveries of the same event yield one row and exactly one of
   * them sees `alreadySeen: false`.
   */
  record(input: WebhookEventInput): Promise<RecordedWebhookEvent>;
  findBySourceEventId(
    source: WebhookSource,
    sourceEventId: string,
  ): Promise<WebhookEvent | null>;
}
