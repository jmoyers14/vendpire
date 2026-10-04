import { z } from "zod";
import { parseConfig } from "../../config/parseConfig.ts";

/**
 * Everything the Cloud Tasks adapter needs to address a queue and describe the
 * callback it should make.
 *
 * `workerUrl` is the worker service's own public URL — Cloud Tasks calls back
 * over HTTP, so the worker has to tell the queue where to reach it. On Cloud Run
 * it's the service URL; locally it's localhost.
 *
 * `invokerServiceAccount` is the identity Cloud Tasks mints an OIDC token as
 * when it calls back. That token is what lets `/tasks/*` reject anything not
 * from the queue — without it the job endpoints would be open to the internet,
 * since the service itself must stay unauthenticated for Clerk's sake.
 */
export interface TasksConfig {
  projectId: string;
  location: string;
  workerUrl: string;
  invokerServiceAccount: string;
}

export const TASKS_CONFIG_TOKEN = "TasksConfig";

const schema = z.object({
  projectId: z.string().min(1, "GCP_PROJECT_ID is required to enqueue tasks"),
  location: z.string().default("us-central1"),
  workerUrl: z.string().url("WORKER_URL must be the worker's own base URL"),
  invokerServiceAccount: z
    .string()
    .min(
      1,
      "TASKS_INVOKER_SERVICE_ACCOUNT is required so /tasks/* can verify callers",
    ),
});

export function loadTasksConfig(): TasksConfig {
  return parseConfig("cloud tasks", schema, {
    projectId: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_LOCATION,
    workerUrl: process.env.WORKER_URL,
    invokerServiceAccount: process.env.TASKS_INVOKER_SERVICE_ACCOUNT,
  });
}
