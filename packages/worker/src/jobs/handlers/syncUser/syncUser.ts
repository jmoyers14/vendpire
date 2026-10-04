import { inject, injectable } from "tsyringe";
import { z } from "zod";
import {
  USER_REPOSITORY_TOKEN,
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  type Job,
  type UserRepository,
  type WebhookEventRepository,
} from "@vendpire/platform";
import type { JobHandler } from "../../JobHandler.ts";
import { PoisonJobError } from "../../PoisonJobError.ts";
import { webhookPayloadSchema } from "../webhookPayload.ts";

/**
 * The slice of Clerk's `user.*` payload we mirror. Clerk sends far more; we
 * parse only what the local User record needs and ignore the rest. Nullable
 * everywhere Clerk allows it — a user can have no name and no email yet.
 */
const clerkUserSchema = z.object({
  id: z.string().min(1),
  first_name: z.string().nullable().default(null),
  last_name: z.string().nullable().default(null),
  image_url: z.string().nullable().default(null),
  primary_email_address_id: z.string().nullable().default(null),
  email_addresses: z
    .array(z.object({ id: z.string(), email_address: z.string() }))
    .default([]),
});

/**
 * Mirrors a Clerk user into the local `users` collection on `user.created` and
 * `user.updated`. Clerk stays the source of truth; this copy exists so the app
 * can join to a user and render a name without a per-request API call.
 *
 * Idempotent by construction: it computes the desired record from the payload
 * and upserts by auth id. Whatever the current local state, the same event
 * converges on the same row — which is exactly what the queue's at-least-once
 * delivery demands.
 */
@injectable()
export class SyncUserHandler implements JobHandler {
  constructor(
    @inject(WEBHOOK_EVENT_REPOSITORY_TOKEN)
    private readonly events: WebhookEventRepository,
    @inject(USER_REPOSITORY_TOKEN)
    private readonly users: UserRepository,
  ) {}

  async handle(job: Job): Promise<void> {
    const { source, sourceEventId } = webhookPayloadSchema.parse(job.payload);
    const event = await this.events.findBySourceEventId(source, sourceEventId);
    if (!event) {
      // The event is recorded before the job is enqueued, so its absence is
      // permanent, not a race worth retrying.
      throw new PoisonJobError("raw event missing");
    }

    // The verifier stored `event.data` (the user object) as the payload. A bad
    // shape throws here, which the runner turns into a failed job.
    const data = clerkUserSchema.parse(event.payload);

    await this.users.upsertByAuthId({
      authUserId: data.id,
      email: primaryEmail(data),
      firstName: data.first_name,
      lastName: data.last_name,
      imageUrl: data.image_url,
    });
  }
}

/**
 * The user's primary email if Clerk marked one, else the first on file, else
 * null. Clerk identifies the primary by id in a separate field rather than
 * flagging the address inline, so this resolves the pointer.
 */
function primaryEmail(data: z.infer<typeof clerkUserSchema>): string | null {
  const primary = data.email_addresses.find(
    (address) => address.id === data.primary_email_address_id,
  );
  return primary?.email_address ?? data.email_addresses[0]?.email_address ?? null;
}
