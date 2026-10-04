import { beforeEach, describe, expect, it } from "bun:test";
import { JOB_TYPES, QUEUES, type VerifiedWebhook } from "@vendpire/platform";
import { IngestService } from "./handler.ts";
import {
  FakeJobRepository,
  FakeTaskQueue,
  FakeWebhookEventRepository,
  FakeWebhookVerifier,
  noopLogger,
} from "../test-support/fakes.ts";

/**
 * The orchestration this covers is the whole reason ingestion is a service and
 * not inline route code: verify → record → route → enqueue-pending →
 * enqueue-task, where the *order* and the *absences* are the contract.
 */

const USER_PAYLOAD = { id: "user_abc", email_addresses: [] };
const ORG_PAYLOAD = { id: "org_abc", name: "Moyers Vending" };
const MEMBERSHIP_PAYLOAD = {
  id: "orgmem_abc",
  role: "org:admin",
  organization: { id: "org_abc" },
  public_user_data: { user_id: "user_abc" },
};

const verified = (over: Partial<VerifiedWebhook> = {}): VerifiedWebhook => ({
  sourceEventId: "msg_1",
  type: "user.created",
  payload: USER_PAYLOAD,
  ...over,
});

let events: FakeWebhookEventRepository;
let jobs: FakeJobRepository;
let queue: FakeTaskQueue;

const service = (result: VerifiedWebhook | null): IngestService =>
  new IngestService(
    new FakeWebhookVerifier(result),
    events,
    jobs,
    queue,
    noopLogger,
  );

/** The route only ever hands the service an unread Request. */
const request = (): Request =>
  new Request("https://worker.local/ingest/clerk", { method: "POST" });

beforeEach(() => {
  events = new FakeWebhookEventRepository();
  jobs = new FakeJobRepository();
  queue = new FakeTaskQueue();
});

describe("IngestService — rejection", () => {
  it("answers 400 and persists absolutely nothing on a bad signature", async () => {
    const result = await service(null).handleClerk(request());

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "invalid signature" });
    // The load-bearing assertion: an unverified request must leave no trace, or
    // a public endpoint becomes an unauthenticated write.
    expect(events.recorded).toHaveLength(0);
    expect(jobs.calls).toHaveLength(0);
    expect(queue.enqueued).toHaveLength(0);
  });
});

describe("IngestService — unrouted events", () => {
  it("records an event it takes no action on and answers 200 so Clerk stops retrying", async () => {
    const result = await service(
      verified({ type: "session.created", payload: {} }),
    ).handleClerk(request());

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "ignored", type: "session.created" });
    // Recorded for audit...
    expect(events.recorded).toHaveLength(1);
    // ...but no work scheduled.
    expect(jobs.calls).toHaveLength(0);
    expect(queue.enqueued).toHaveLength(0);
  });
});

describe("IngestService — routed events", () => {
  it("records, enqueues a pending job, then enqueues the task, and answers 202", async () => {
    const result = await service(verified()).handleClerk(request());

    expect(result.status).toBe(202);
    expect(result.body).toEqual({
      status: "queued",
      jobType: JOB_TYPES.SYNC_USER,
    });

    expect(events.recorded).toEqual([
      {
        source: "clerk",
        sourceEventId: "msg_1",
        type: "user.created",
        payload: USER_PAYLOAD,
      },
    ]);

    // The job row exists before the task does. The safe failure mode is "row but
    // no task" — visible and retryable — never a task with no row to record to.
    expect(jobs.calls).toEqual(["enqueuePending"]);
    expect(await jobs.findByKey(JOB_TYPES.SYNC_USER, "clerk:msg_1")).toMatchObject({
      jobType: JOB_TYPES.SYNC_USER,
      dedupKey: "clerk:msg_1",
      status: "pending",
      payload: { source: "clerk", sourceEventId: "msg_1" },
    });

    expect(queue.enqueued).toEqual([
      {
        queue: QUEUES.USER_SYNC,
        jobType: JOB_TYPES.SYNC_USER,
        name: "syncUser_clerk_msg_1_0",
        payload: { dedupKey: "clerk:msg_1" },
      },
    ]);
  });

  it("derives the dedup key from the source and the provider's delivery id", async () => {
    await service(verified({ sourceEventId: "msg_xyz" })).handleClerk(request());

    expect(queue.enqueued[0]?.payload).toEqual({ dedupKey: "clerk:msg_xyz" });
  });
});

describe("IngestService — tenant tagging", () => {
  it("tags an organization job with the payload's own id", async () => {
    await service(
      verified({ type: "organization.created", payload: ORG_PAYLOAD }),
    ).handleClerk(request());

    const job = await jobs.findByKey(JOB_TYPES.SYNC_ORG, "clerk:msg_1");
    expect(job?.orgId).toBe("org_abc");
  });

  it("tags a membership job with the nested organization id, not the payload's own", async () => {
    // A membership payload's `id` is the membership's — reading it as the org
    // would tag every membership job with a value that matches no tenant.
    await service(
      verified({
        type: "organizationMembership.created",
        payload: MEMBERSHIP_PAYLOAD,
      }),
    ).handleClerk(request());

    const job = await jobs.findByKey(
      JOB_TYPES.SYNC_ORG_MEMBERSHIP,
      "clerk:msg_1",
    );
    expect(job?.orgId).toBe("org_abc");
  });

  it("leaves a user job's org null rather than guessing", async () => {
    await service(verified()).handleClerk(request());

    const job = await jobs.findByKey(JOB_TYPES.SYNC_USER, "clerk:msg_1");
    expect(job?.orgId).toBeNull();
  });

  it("leaves the org null when an org-shaped payload has no usable id", async () => {
    await service(
      verified({ type: "organization.updated", payload: { id: 42 } }),
    ).handleClerk(request());

    const job = await jobs.findByKey(JOB_TYPES.SYNC_ORG, "clerk:msg_1");
    expect(job?.orgId).toBeNull();
  });
});

describe("IngestService — redelivery", () => {
  it("converges without duplicating the event, the job, or the work", async () => {
    const first = await service(verified()).handleClerk(request());
    const second = await service(verified()).handleClerk(request());

    // Same answer both times — the provider can't tell, and shouldn't.
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);

    // One event row, holding the originally received payload.
    const stored = await events.findBySourceEventId("clerk", "msg_1");
    expect(stored?.payload).toEqual(USER_PAYLOAD);

    // One job row, still pending — NOT reset, NOT a second row.
    const job = await jobs.findByKey(JOB_TYPES.SYNC_USER, "clerk:msg_1");
    expect(job?.id).toBe("job_1");
    expect(job?.attempts).toBe(0);
    expect(await jobs.findByStatus("pending", 10)).toHaveLength(1);
  });

  it("re-enqueues on redelivery rather than short-circuiting, so a crash mid-flow self-heals", async () => {
    await service(verified()).handleClerk(request());
    await service(verified()).handleClerk(request());

    // Nothing branches on `alreadySeen`: if the first run died between writing
    // the row and enqueuing, the second must still create the task. Re-enqueuing
    // an identical task name is a no-op at the queue, so this is free.
    expect(queue.enqueued).toHaveLength(2);
    expect(queue.enqueued[0]).toEqual(queue.enqueued[1]);
  });
});
