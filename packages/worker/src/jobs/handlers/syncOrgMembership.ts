import { inject, injectable } from "tsyringe";
import { z } from "zod";
import {
  ORGANIZATION_MEMBERSHIP_REPOSITORY_TOKEN,
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  type Job,
  type OrganizationMembershipRepository,
  type WebhookEventRepository,
} from "@vendpire/platform";
import type { JobHandler } from "../JobHandler.ts";
import { PoisonJobError } from "../PoisonJobError.ts";
import { webhookPayloadSchema } from "./webhookPayload.ts";

/**
 * Clerk's `organizationMembership.*` payload (event.data). Both ids are nested
 * rather than top-level: the payload's own `id` is the membership's, not the
 * org's or the user's.
 */
const clerkMembershipSchema = z.object({
  role: z.string().min(1),
  organization: z.object({ id: z.string().min(1) }),
  public_user_data: z.object({ user_id: z.string().min(1) }),
});

/** The event type that means "remove", as opposed to create/update. */
const DELETED_EVENT = "organizationMembership.deleted";

/**
 * Mirrors org membership into the local `organizationmemberships` collection on
 * all three `organizationMembership.*` events.
 *
 * The only handler that reads `event.type`. Created/updated/deleted carry the
 * same payload shape and deserve the same retry policy, so they share one job
 * type and one queue, and the branch lives here rather than in a second
 * near-identical handler. The recorded event already carries its type, so
 * nothing extra has to be threaded through the queue to make that choice.
 *
 * Idempotent either way: the upsert converges by (orgId, authUserId), and the
 * soft delete is a no-op once the row is already marked.
 */
@injectable()
export class SyncOrgMembershipHandler implements JobHandler {
  constructor(
    @inject(WEBHOOK_EVENT_REPOSITORY_TOKEN)
    private readonly events: WebhookEventRepository,
    @inject(ORGANIZATION_MEMBERSHIP_REPOSITORY_TOKEN)
    private readonly memberships: OrganizationMembershipRepository,
  ) {}

  async handle(job: Job): Promise<void> {
    const { source, sourceEventId } = webhookPayloadSchema.parse(job.payload);
    const event = await this.events.findBySourceEventId(source, sourceEventId);
    if (!event) {
      // Recorded before the job was enqueued, so absence is permanent.
      throw new PoisonJobError("raw event missing");
    }

    const data = clerkMembershipSchema.parse(event.payload);
    const orgId = data.organization.id;
    const authUserId = data.public_user_data.user_id;

    if (event.type === DELETED_EVENT) {
      await this.memberships.softDeleteByOrgAndUser(orgId, authUserId);
      return;
    }

    await this.memberships.upsertByOrgAndUser({
      orgId,
      authUserId,
      role: data.role,
    });
  }
}
