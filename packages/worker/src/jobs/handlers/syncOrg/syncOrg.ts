import { inject, injectable } from "tsyringe";
import { z } from "zod";
import {
  ORGANIZATION_REPOSITORY_TOKEN,
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  type Job,
  type OrganizationRepository,
  type WebhookEventRepository,
} from "@vendpire/platform";
import type { JobHandler } from "../../JobHandler.ts";
import { PoisonJobError } from "../../PoisonJobError.ts";
import { webhookPayloadSchema } from "../webhookPayload.ts";

/**
 * Clerk's `organization.*` payload (event.data). The id IS the app's orgId — the
 * Clerk organization is the business, and that string keys every other
 * collection.
 */
const clerkOrgSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  slug: z.string().nullable().default(null),
  image_url: z.string().nullable().default(null),
});

/**
 * Mirrors a Clerk organization into the local `organizations` collection on
 * `organization.created` and `organization.updated`.
 *
 * Idempotent by construction, like SyncUserHandler: desired state is computed
 * from the payload and upserted by orgId, so any starting state and any
 * delivery order converge on the same row.
 */
@injectable()
export class SyncOrgHandler implements JobHandler {
  constructor(
    @inject(WEBHOOK_EVENT_REPOSITORY_TOKEN)
    private readonly events: WebhookEventRepository,
    @inject(ORGANIZATION_REPOSITORY_TOKEN)
    private readonly organizations: OrganizationRepository,
  ) {}

  async handle(job: Job): Promise<void> {
    const { source, sourceEventId } = webhookPayloadSchema.parse(job.payload);
    const event = await this.events.findBySourceEventId(source, sourceEventId);
    if (!event) {
      // Recorded before the job was enqueued, so absence is permanent.
      throw new PoisonJobError("raw event missing");
    }

    const data = clerkOrgSchema.parse(event.payload);

    await this.organizations.upsertByOrgId({
      orgId: data.id,
      name: data.name,
      slug: data.slug,
      imageUrl: data.image_url,
    });
  }
}
