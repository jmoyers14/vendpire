import { CloudTasksClient } from "@google-cloud/tasks";
import { inject, injectable } from "tsyringe";
import { TASKS_CONFIG_TOKEN, type TasksConfig } from "./tasksConfig.ts";
import type { TaskQueue, TaskRequest } from "./TaskQueue.ts";

/** gRPC status code for "a task with this name already exists". */
const ALREADY_EXISTS = 6;

/**
 * Google Cloud Tasks adapter for the TaskQueue port. The only file that knows
 * which queue provider is in use.
 *
 * Two things it relies on the provider for:
 *  - **Dedup by name.** A named task that already exists is rejected, which is
 *    the queue-level half of idempotency (the job row is the other half).
 *  - **Retries.** Backoff and max-attempts are queue configuration, not code,
 *    so a stuck job is retuned without a deploy.
 */
@injectable()
export class CloudTasksQueue implements TaskQueue {
  private readonly client = new CloudTasksClient();

  constructor(
    @inject(TASKS_CONFIG_TOKEN)
    private readonly config: TasksConfig,
  ) {}

  async enqueue(request: TaskRequest): Promise<void> {
    const { projectId, location, workerUrl, invokerServiceAccount } = this.config;
    const parent = this.client.queuePath(projectId, location, request.queue);

    try {
      await this.client.createTask({
        parent,
        task: {
          // Fully-qualified name: supplying it is what enables dedup. Cloud
          // Tasks keeps a name reserved for some time after completion, so a
          // late redelivery is still rejected rather than re-run.
          name: `${parent}/tasks/${request.name}`,
          httpRequest: {
            httpMethod: "POST",
            url: `${workerUrl}/tasks/${request.jobType}`,
            headers: { "content-type": "application/json" },
            body: Buffer.from(JSON.stringify(request.payload)).toString("base64"),
            // Makes Cloud Tasks present an OIDC token as this service account.
            // `/tasks/*` verifies it, which is the only thing keeping those
            // endpoints closed on an otherwise-public service.
            oidcToken: {
              serviceAccountEmail: invokerServiceAccount,
              audience: workerUrl,
            },
          },
        },
      });
    } catch (error) {
      // Duplicate name means the work is already queued — the contract says
      // that's a no-op, not a failure. Swallowing it here is what lets the
      // ingestion path answer 2xx to a redelivery instead of 500, which in turn
      // stops the provider retrying forever.
      if (isAlreadyExists(error)) {
        return;
      }
      throw error;
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === ALREADY_EXISTS;
}
