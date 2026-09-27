/**
 * A request to run one job asynchronously.
 */
export interface TaskRequest {
  /** Which queue to place it on — queues are per job kind, so retry and rate policy can differ. */
  queue: string;
  /**
   * What to run. Determines the callback path (`/tasks/{jobType}`) and, at the
   * other end, which handler the registry looks up.
   */
  jobType: string;
  /**
   * A deterministic, caller-computed task name (derived from source +
   * sourceEventId + jobType — the same key the job row dedups on). This is the
   * queue-level half of idempotency: given the same name, the queue refuses the
   * duplicate, so a provider redelivery can't produce two runs even if it slips
   * past the database check.
   */
  name: string;
  /** Body handed back to the worker when the task is delivered. */
  payload: unknown;
}

/**
 * Port for the async job queue. Named by capability, not vendor — Cloud Tasks
 * sits behind it today.
 *
 * `enqueue` is idempotent: submitting a name the queue already knows is a
 * no-op, NOT an error. Adapters must absorb the provider's duplicate-name
 * rejection rather than surfacing it, so the ingestion path doesn't have to
 * distinguish "already queued" from "failed to queue" — those need opposite
 * responses to the provider.
 */
export interface TaskQueue {
  enqueue(request: TaskRequest): Promise<void>;
}
