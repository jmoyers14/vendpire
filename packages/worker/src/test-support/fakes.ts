import type {
  Job,
  JobInput,
  JobRepository,
  JobStatus,
  Logger,
  Organization,
  OrganizationInput,
  OrganizationMembership,
  OrganizationMembershipInput,
  OrganizationMembershipRepository,
  OrganizationRepository,
  RecordedWebhookEvent,
  TaskQueue,
  TaskRequest,
  User,
  UserInput,
  UserRepository,
  VerifiedWebhook,
  WebhookEvent,
  WebhookEventInput,
  WebhookEventRepository,
  WebhookSource,
  WebhookVerifier,
} from "@vendpire/platform";

/**
 * Hand-written in-memory fakes for the ports the worker depends on, matching the
 * house convention (see packages/api/src/services/test-support/fakes.ts): real
 * classes implementing the port, not mock()/spy objects, so a port change is a
 * compile error rather than a silently stale double.
 *
 * Each records what it was asked to do, because most of what's worth asserting
 * about ingestion is *ordering* and *absence* — "the job row was written before
 * the task", "nothing was persisted at all".
 */

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

/** A logger that satisfies the port and does nothing. */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
};

/** A verifier that accepts everything, returning a fixed verified event. */
export class FakeWebhookVerifier implements WebhookVerifier {
  constructor(private readonly result: VerifiedWebhook | null) {}

  async verify(): Promise<VerifiedWebhook | null> {
    return this.result;
  }
}

export class FakeWebhookEventRepository implements WebhookEventRepository {
  public recorded: WebhookEventInput[] = [];
  private readonly byKey = new Map<string, WebhookEvent>();

  /** Pre-load an event so a handler can resolve it without an ingest run. */
  seed(event: WebhookEvent): void {
    this.byKey.set(`${event.source}:${event.sourceEventId}`, event);
  }

  async record(input: WebhookEventInput): Promise<RecordedWebhookEvent> {
    this.recorded.push(input);
    const key = `${input.source}:${input.sourceEventId}`;
    const existing = this.byKey.get(key);
    if (existing) {
      // $setOnInsert semantics: the stored payload stays the first one we saw.
      return { event: existing, alreadySeen: true };
    }
    const event: WebhookEvent = {
      id: `evt_${this.byKey.size + 1}`,
      receivedAt: TIMESTAMP,
      ...input,
    };
    this.byKey.set(key, event);
    return { event, alreadySeen: false };
  }

  async findBySourceEventId(
    source: WebhookSource,
    sourceEventId: string,
  ): Promise<WebhookEvent | null> {
    return this.byKey.get(`${source}:${sourceEventId}`) ?? null;
  }
}

/** A WebhookEventRepository that only ever resolves the one event under test. */
export const eventsReturning = (
  found: WebhookEvent | null,
): WebhookEventRepository => ({
  record: async () => {
    throw new Error("record must not be called from a handler");
  },
  findBySourceEventId: async () => found,
});

export class FakeJobRepository implements JobRepository {
  /** Lifecycle transitions in order, for asserting what the runner did. */
  public calls: string[] = [];
  private readonly byKey = new Map<string, Job>();
  private nextId = 1;

  seed(job: Job): void {
    this.byKey.set(`${job.jobType}:${job.dedupKey}`, job);
  }

  async enqueuePending(input: JobInput): Promise<Job> {
    this.calls.push("enqueuePending");
    const key = `${input.jobType}:${input.dedupKey}`;
    const existing = this.byKey.get(key);
    if (existing) {
      // $setOnInsert: a redelivery must find the row exactly as it left it —
      // never reset back to pending.
      return existing;
    }
    const job: Job = {
      id: `job_${this.nextId++}`,
      result: null,
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      ...input,
    };
    this.byKey.set(key, job);
    return job;
  }

  async markRunning(id: string): Promise<Job | null> {
    this.calls.push("markRunning");
    return this.mutate(id, (job) => ({
      ...job,
      status: "running",
      attempts: job.attempts + 1,
    }));
  }

  async markSucceeded(id: string, result?: unknown): Promise<Job | null> {
    this.calls.push("markSucceeded");
    return this.mutate(id, (job) => ({
      ...job,
      status: "succeeded",
      result: result ?? null,
      lastError: null,
    }));
  }

  async markFailed(id: string, error: string): Promise<Job | null> {
    this.calls.push("markFailed");
    return this.mutate(id, (job) => ({
      ...job,
      status: "failed",
      lastError: error,
    }));
  }

  async findByKey(jobType: string, dedupKey: string): Promise<Job | null> {
    return this.byKey.get(`${jobType}:${dedupKey}`) ?? null;
  }

  async findForOrg(orgId: string, id: string): Promise<Job | null> {
    const job = this.find(id);
    return job?.orgId === orgId ? job : null;
  }

  async findByStatus(status: JobStatus, limit: number): Promise<Job[]> {
    return [...this.byKey.values()]
      .filter((job) => job.status === status)
      .slice(0, limit);
  }

  private find(id: string): Job | null {
    return [...this.byKey.values()].find((job) => job.id === id) ?? null;
  }

  private mutate(id: string, change: (job: Job) => Job): Job | null {
    for (const [key, job] of this.byKey) {
      if (job.id === id) {
        const next = change(job);
        this.byKey.set(key, next);
        return next;
      }
    }
    return null;
  }
}

export class FakeTaskQueue implements TaskQueue {
  public enqueued: TaskRequest[] = [];

  async enqueue(request: TaskRequest): Promise<void> {
    this.enqueued.push(request);
  }
}

export class FakeUserRepository implements UserRepository {
  public upserts: UserInput[] = [];
  public deleted: string[] = [];

  async upsertByAuthId(input: UserInput): Promise<User> {
    this.upserts.push(input);
    return {
      id: "user_1",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      ...input,
    };
  }

  async findByAuthId(): Promise<User | null> {
    return null;
  }

  async deleteByAuthId(authUserId: string): Promise<void> {
    this.deleted.push(authUserId);
  }
}

export class FakeOrganizationRepository implements OrganizationRepository {
  public upserts: OrganizationInput[] = [];
  public softDeleted: string[] = [];

  async upsertByOrgId(input: OrganizationInput): Promise<Organization> {
    this.upserts.push(input);
    return {
      id: "organization_1",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      ...input,
    };
  }

  async findByOrgId(): Promise<Organization | null> {
    return null;
  }

  async softDeleteByOrgId(orgId: string): Promise<void> {
    this.softDeleted.push(orgId);
  }
}

export class FakeOrganizationMembershipRepository
  implements OrganizationMembershipRepository
{
  public upserts: OrganizationMembershipInput[] = [];
  public softDeleted: Array<{ orgId: string; authUserId: string }> = [];

  async upsertByOrgAndUser(
    input: OrganizationMembershipInput,
  ): Promise<OrganizationMembership> {
    this.upserts.push(input);
    return {
      id: "membership_1",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      ...input,
    };
  }

  async findByOrg(): Promise<OrganizationMembership[]> {
    return [];
  }

  async findByUser(): Promise<OrganizationMembership[]> {
    return [];
  }

  async softDeleteByOrgAndUser(
    orgId: string,
    authUserId: string,
  ): Promise<void> {
    this.softDeleted.push({ orgId, authUserId });
  }
}
