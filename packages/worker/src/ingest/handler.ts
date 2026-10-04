import { inject, injectable } from "tsyringe";
import {
  CLERK_WEBHOOK_VERIFIER_TOKEN,
  JOB_REPOSITORY_TOKEN,
  LOGGER_TOKEN,
  TASK_QUEUE_TOKEN,
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  taskName,
  type JobRepository,
  type Logger,
  type TaskQueue,
  type WebhookEventRepository,
  type WebhookSource,
  type WebhookVerifier,
} from "@vendpire/platform";
import { routeEvent } from "./eventRouting.ts";

/** The only source this endpoint serves. */
const SOURCE: WebhookSource = "clerk";

/** An HTTP outcome for the route to return. */
export interface IngestResult {
  status: number;
  body: unknown;
}

/**
 * Owns the `/ingest/clerk` flow. Every write for an inbound webhook happens
 * here; the handlers downstream only read.
 *
 * The sequence is verify → record → (route) → enqueue-pending → enqueue-task,
 * and every step is idempotent so a provider redelivery is fully absorbed:
 *  - a bad signature never persists anything (400);
 *  - the raw event is recorded before any work is scheduled, so there's an audit
 *    row even if scheduling later fails;
 *  - the pending job row is written BEFORE the task is enqueued, so the safe
 *    failure mode is "job row exists but no task" — visible and retryable —
 *    rather than a task with no row to record into.
 *
 * Redelivery after a crash mid-flow is self-healing: record/enqueuePending/
 * enqueue are all idempotent, so re-running them ensures the row and task exist
 * without ever duplicating or resetting completed work. That's why nothing here
 * short-circuits on `alreadySeen` — it's logged, not branched on.
 *
 * One path is deliberately uncaught: if Mongo is down, `record` throws out
 * through Bun.serve's fetch and the caller sees a 500. That's the right answer
 * (Clerk retries), and it's why the three 2xx/4xx outcomes below each log —
 * otherwise a rejected signature or an ignored event would leave no trace.
 */
@injectable()
export class IngestService {
  constructor(
    @inject(CLERK_WEBHOOK_VERIFIER_TOKEN)
    private readonly verifier: WebhookVerifier,
    @inject(WEBHOOK_EVENT_REPOSITORY_TOKEN)
    private readonly events: WebhookEventRepository,
    @inject(JOB_REPOSITORY_TOKEN)
    private readonly jobs: JobRepository,
    @inject(TASK_QUEUE_TOKEN)
    private readonly queue: TaskQueue,
    @inject(LOGGER_TOKEN)
    private readonly logger: Logger,
  ) {}

  async handleClerk(request: Request): Promise<IngestResult> {
    const verified = await this.verifier.verify(request);
    if (!verified) {
      // Routine on a public endpoint (scanners, replays, rotated secret). 400
      // and persist nothing. Warn, not error — this is expected traffic.
      this.logger.warn(
        { source: SOURCE },
        "rejected webhook with invalid signature",
      );
      return { status: 400, body: { error: "invalid signature" } };
    }

    const { sourceEventId, type, payload } = verified;
    const log = this.logger.child({ source: SOURCE, sourceEventId, type });

    // Audit first: the raw event is stored before anything acts on it, so a
    // later failure can be replayed without asking Clerk to redeliver.
    const { alreadySeen } = await this.events.record({
      source: SOURCE,
      sourceEventId,
      type,
      payload,
    });

    const route = routeEvent(type);
    if (!route) {
      // Recorded, but we take no action on this type. 200 so Clerk marks it
      // delivered and stops retrying.
      log.info("recorded webhook with no route; ignoring");
      return { status: 200, body: { status: "ignored", type } };
    }

    // The content key for a webhook-derived job. One event can fan out to
    // several job types, and (jobType, dedupKey) is unique, so they don't
    // collide.
    const dedupKey = `${SOURCE}:${sourceEventId}`;

    await this.jobs.enqueuePending({
      jobType: route.jobType,
      dedupKey,
      orgId: orgIdFrom(type, payload),
      // The handler resolves the raw event from this pointer.
      payload: { source: SOURCE, sourceEventId },
    });

    await this.queue.enqueue({
      queue: route.queue,
      jobType: route.jobType,
      name: taskName(route.jobType, dedupKey, 0),
      payload: { dedupKey },
    });

    log.info(
      { jobType: route.jobType, queue: route.queue, alreadySeen },
      "queued job for webhook",
    );
    return { status: 202, body: { status: "queued", jobType: route.jobType } };
  }
}

/**
 * Best-effort tenant tag for operational queries — "what happened to this org".
 * Never read for authorization.
 *
 * Clerk puts the org id in two different places: an `organization.*` payload IS
 * the org, so the id is its own; an `organizationMembership.*` payload nests the
 * org it belongs to. `user.*` events carry no reliable org at all, so they're
 * recorded with null rather than guessing.
 */
function orgIdFrom(type: string, payload: unknown): string | null {
  if (type.startsWith("organizationMembership.")) {
    const nested = (payload as { organization?: { id?: unknown } } | null)
      ?.organization?.id;
    return typeof nested === "string" ? nested : null;
  }
  if (type.startsWith("organization.")) {
    const id = (payload as { id?: unknown } | null)?.id;
    return typeof id === "string" ? id : null;
  }
  return null;
}
