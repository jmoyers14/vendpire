/**
 * The job kinds the worker knows how to run, and the queues they ride on.
 *
 * One module so three things can't drift apart: the router (event type → job),
 * the registry (job → handler), and the queue names deploy.sh must create. A
 * job type that isn't in `JOB_TYPES` has no handler; a queue not in `QUEUES`
 * won't exist in Cloud Tasks.
 *
 * It lives in platform rather than in the worker so a second entrypoint that
 * starts enqueuing reads the same table — a job type that drifted between them
 * would route work to a handler that doesn't exist.
 */
export const JOB_TYPES = {
  SYNC_USER: "syncUser",
  SYNC_ORG: "syncOrg",
  SYNC_ORG_MEMBERSHIP: "syncOrgMembership",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

/**
 * Queue per job kind, so retry/backoff/rate policy is tuned independently —
 * mirroring a user record and reconciling an org's membership roster fail for
 * different reasons and deserve different retry behaviour.
 */
export const QUEUES = {
  USER_SYNC: "user-sync-queue",
  ORG_SYNC: "org-sync-queue",
  ORG_MEMBERSHIP_SYNC: "org-membership-sync-queue",
} as const;
