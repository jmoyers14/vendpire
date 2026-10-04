/**
 * Lifecycle of a job. `failed` means the last attempt failed — the queue may
 * still retry it, at which point it goes back to `running`. Only `succeeded` is
 * terminal.
 */
export type JobStatus = "pending" | "running" | "succeeded" | "failed";

/** One unit of background work, plus its execution record. Plain data. */
export interface Job {
  id: string;
  /** What to run. Maps to a registered handler and to `/tasks/{jobType}`. */
  jobType: string;
  /** Content key — (jobType, dedupKey) is unique. Shape is per job type. */
  dedupKey: string;
  /** Null for jobs with no tenant (syncUser). Never trusted for authorization. */
  orgId: string | null;
  /** Handler input. Validated at the handler boundary, not by the schema. */
  payload: unknown;
  /** Handler output, recorded on success. */
  result: unknown;
  status: JobStatus;
  /** How many times the worker has started this job. */
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields supplied when a job is first enqueued. Status/attempts/lastError/result
 * are owned by the execution path, not the caller, so they aren't accepted here.
 */
export type JobInput = Pick<Job, "jobType" | "dedupKey" | "orgId" | "payload">;
