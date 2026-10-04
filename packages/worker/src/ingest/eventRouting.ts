import { JOB_TYPES, QUEUES } from "@vendpire/platform";

/**
 * Where a verified event goes: which job to run, on which queue.
 */
export interface EventRoute {
  jobType: string;
  queue: string;
}

/**
 * The routing table — the single place that decides what an inbound Clerk event
 * turns into. A table rather than code because the mapping is data: adding an
 * event is a new row, and the set of handled events is readable at a glance.
 *
 * Each event maps to at most one job. The job dedup key carries jobType, so
 * fanning one event out to several jobs later is additive (a value becomes a
 * list) and doesn't disturb what's here.
 *
 * All three `organizationMembership.*` events share one job type: they carry the
 * same payload shape and deserve the same retry policy, and the handler reads
 * the recorded event's `type` to decide upsert vs remove.
 */
const ROUTES: Record<string, EventRoute> = {
  "user.created": { jobType: JOB_TYPES.SYNC_USER, queue: QUEUES.USER_SYNC },
  "user.updated": { jobType: JOB_TYPES.SYNC_USER, queue: QUEUES.USER_SYNC },
  "organization.created": { jobType: JOB_TYPES.SYNC_ORG, queue: QUEUES.ORG_SYNC },
  "organization.updated": { jobType: JOB_TYPES.SYNC_ORG, queue: QUEUES.ORG_SYNC },
  "organizationMembership.created": {
    jobType: JOB_TYPES.SYNC_ORG_MEMBERSHIP,
    queue: QUEUES.ORG_MEMBERSHIP_SYNC,
  },
  "organizationMembership.updated": {
    jobType: JOB_TYPES.SYNC_ORG_MEMBERSHIP,
    queue: QUEUES.ORG_MEMBERSHIP_SYNC,
  },
  "organizationMembership.deleted": {
    jobType: JOB_TYPES.SYNC_ORG_MEMBERSHIP,
    queue: QUEUES.ORG_MEMBERSHIP_SYNC,
  },
};

/**
 * Resolve an event type to its route, or null if we don't act on it. Null is a
 * normal outcome, not an error: Clerk sends dozens of event types and we
 * subscribe broadly, so most verified events are recorded for audit and
 * otherwise ignored.
 *
 * `user.deleted` and `organization.deleted` are intentionally absent. The
 * repositories have the delete methods, but choosing what a vanished Clerk user
 * should do to the visits and purchases that reference them is a decision worth
 * making deliberately — deferred rather than half-done.
 */
export function routeEvent(type: string): EventRoute | null {
  // Object.hasOwn, not a bare index: a plain-object lookup also resolves
  // Object.prototype members, so `routeEvent("toString")` would otherwise hand
  // back a function that reads as a route with an undefined jobType, and
  // ingestion would enqueue a job no handler could ever claim.
  return Object.hasOwn(ROUTES, type) ? ROUTES[type] : null;
}
