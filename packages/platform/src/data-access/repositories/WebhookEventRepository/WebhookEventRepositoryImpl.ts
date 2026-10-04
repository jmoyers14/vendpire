import { injectable } from "tsyringe";
import { WebhookEventModel } from "../../models/WebhookEvent.ts";
import type {
  RecordedWebhookEvent,
  WebhookEvent,
  WebhookEventInput,
  WebhookEventRepository,
  WebhookSource,
} from "./WebhookEventRepository.ts";

type WebhookEventDoc = {
  _id: unknown;
  source: string;
  sourceEventId: string;
  type: string;
  payload: unknown;
  receivedAt: Date;
};

/**
 * Mongoose-backed WebhookEventRepository. Documents are mapped to the plain
 * WebhookEvent entity so Mongoose types never escape.
 */
@injectable()
export class WebhookEventRepositoryImpl implements WebhookEventRepository {
  async record(input: WebhookEventInput): Promise<RecordedWebhookEvent> {
    // $setOnInsert, not $set: a redelivery must never overwrite the originally
    // received payload. The stored bytes stay the first ones we saw.
    const result = await WebhookEventModel.findOneAndUpdate(
      { source: input.source, sourceEventId: input.sourceEventId },
      { $setOnInsert: { type: input.type, payload: input.payload } },
      { upsert: true, returnDocument: "after", includeResultMetadata: true },
    ).lean<{
      value: WebhookEventDoc;
      lastErrorObject?: { updatedExisting?: boolean };
    }>();

    return {
      event: toWebhookEvent(result.value),
      alreadySeen: result.lastErrorObject?.updatedExisting === true,
    };
  }

  async findBySourceEventId(
    source: WebhookSource,
    sourceEventId: string,
  ): Promise<WebhookEvent | null> {
    const doc = await WebhookEventModel.findOne({
      source,
      sourceEventId,
    }).lean<WebhookEventDoc | null>();
    return doc ? toWebhookEvent(doc) : null;
  }
}

export function toWebhookEvent(doc: WebhookEventDoc): WebhookEvent {
  return {
    id: String(doc._id),
    source: doc.source as WebhookSource,
    sourceEventId: doc.sourceEventId,
    type: doc.type,
    payload: doc.payload,
    receivedAt: doc.receivedAt.toISOString(),
  };
}
