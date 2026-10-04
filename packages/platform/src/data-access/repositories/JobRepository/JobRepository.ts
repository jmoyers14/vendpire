import type { Job, JobInput, JobStatus } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for background jobs.
 *
 * Write methods are split by lifecycle transition rather than exposing a general
 * `update`, so the set of legal state changes is visible here and the execution
 * path can't invent a new one.
 *
 * Reads are split by caller instead: `findByKey` is the worker's (it addresses a
 * job by the key the task carries, and the worker has no request tenant), while
 * `findForOrg` is org-scoped by signature for any future api status poll. There
 * is deliberately no unscoped find-by-id, because that is what a cross-tenant
 * read would use.
 */
export interface JobRepository {
  /**
   * Registers a job as pending, or returns the existing one untouched. Uses
   * $setOnInsert on (jobType, dedupKey), so a redelivery can NOT reset an
   * already-succeeded job back to pending. That is the single most important
   * property of this table.
   */
  enqueuePending(input: JobInput): Promise<Job>;
  /** Marks a job as started and increments its attempt count. */
  markRunning(id: string): Promise<Job | null>;
  markSucceeded(id: string, result?: unknown): Promise<Job | null>;
  markFailed(id: string, error: string): Promise<Job | null>;
  findByKey(jobType: string, dedupKey: string): Promise<Job | null>;
  /** Tenant-scoped read, for a future api status poll. */
  findForOrg(orgId: string, id: string): Promise<Job | null>;
  /** Operational read: what's stuck or broken. Backs alerting and manual retry. */
  findByStatus(status: JobStatus, limit: number): Promise<Job[]>;
}
