import type { Job } from "../data-access/repositories/JobRepository/JobRepository.ts";
import type { WebhookEvent } from "../data-access/repositories/WebhookEventRepository/WebhookEventRepository.ts";

/**
 * Fixed timestamps. Date.now() in a factory makes assertions non-deterministic
 * and the exact values never matter to a test — only that they're valid ISO.
 */
const CREATED_AT = "2026-01-01T00:00:00.000Z";

/**
 * A Job as the runner would hand it to a handler. Every worker handler test
 * needs one, so the builder lives here rather than being hand-rolled per file.
 */
export const makeJob = (over: Partial<Job> = {}): Job => ({
  id: "job_1",
  jobType: "syncUser",
  dedupKey: "clerk:msg_1",
  orgId: null,
  payload: null,
  result: null,
  status: "pending",
  attempts: 0,
  lastError: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...over,
});

/**
 * A recorded WebhookEvent. `payload` is what the verifier stored — Clerk's
 * `event.data`, i.e. the entity that changed.
 */
export const makeWebhookEvent = (
  over: Partial<WebhookEvent> = {},
): WebhookEvent => ({
  id: "evt_1",
  source: "clerk",
  sourceEventId: "msg_1",
  type: "user.created",
  payload: {},
  receivedAt: CREATED_AT,
  ...over,
});
