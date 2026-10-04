import { z } from "zod";

/**
 * What a queued task carries: just enough to find its job row again. The task is
 * self-describing by content key rather than by Mongo id, so nothing about the
 * database leaks into the queue.
 *
 * jobType is NOT in the body — it's in the callback URL (`/tasks/{jobType}`),
 * which is what selects the handler. Keeping it out means the two can't disagree.
 */
export const taskBodySchema = z.object({ dedupKey: z.string().min(1) });

export type TaskBody = z.infer<typeof taskBodySchema>;

/**
 * The Cloud Tasks task name — the queue-level dedup key.
 *
 * `attempts` is in the name deliberately. Named for `(jobType, dedupKey)` alone,
 * a manual retry of a *failed* job would be silently refused as a duplicate,
 * because Cloud Tasks keeps a name reserved after completion. Including the
 * attempt count makes a retry genuinely a new task while an accidental
 * double-click (same attempts) is still refused. Cloud Tasks names allow only
 * `[A-Za-z0-9_-]`, so anything else is replaced.
 */
export function taskName(
  jobType: string,
  dedupKey: string,
  attempts: number,
): string {
  return `${jobType}:${dedupKey}:${attempts}`.replace(/[^A-Za-z0-9_-]/g, "_");
}
