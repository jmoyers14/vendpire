import "reflect-metadata"; // MUST be imported before any decorated class is used
import { instanceCachingFactory, type DependencyContainer } from "tsyringe";
import { APP_CONFIG_TOKEN, type AppConfig } from "./config/appConfig.ts";
import {
  TASKS_CONFIG_TOKEN,
  loadTasksConfig,
} from "./integrations/tasks/tasksConfig.ts";
import { CloudTasksQueue } from "./integrations/tasks/CloudTasksQueue.ts";
import { InlineTaskQueue } from "./integrations/tasks/InlineTaskQueue.ts";
import { TASK_QUEUE_TOKEN } from "./integrations/tokens.ts";

/**
 * Registers the async job queue.
 *
 * Its own module, imported from its own entry rather than the /server barrel,
 * because it statically pulls the Cloud Tasks SDK. Keeping it off /server is
 * what stops the api (which imports /server) from bundling that SDK and
 * crashing at boot.
 *
 * Only the worker calls this today, via registerWebhookCore. It stays a separate
 * function anyway because the queue is not webhook-specific — the day the api
 * enqueues something, it calls this one and not the webhook core.
 *
 * Call AFTER registerServerCore: the adapter choice reads AppConfig.
 */
export function registerTaskQueue(container: DependencyContainer): void {
  container.register(TASKS_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadTasksConfig()),
  });

  // Environment picks the queue. Resolved lazily inside the factory so the Cloud
  // Tasks config is only validated when that adapter is actually chosen — local
  // dev must not be made to supply a GCP project id.
  container.register(TASK_QUEUE_TOKEN, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      const { environment } =
        dependencyContainer.resolve<AppConfig>(APP_CONFIG_TOKEN);
      return environment === "local"
        ? dependencyContainer.resolve(InlineTaskQueue)
        : dependencyContainer.resolve(CloudTasksQueue);
    }),
  });
}
