import { container } from "./container.ts";
import { createRequestHandler } from "./routes.ts";
import { IngestService } from "./ingest/handler.ts";
import { JobRunner } from "./jobs/runJob.ts";
import {
  TASK_AUTHENTICATOR_TOKEN,
  type TaskAuthenticator,
} from "@vendpire/platform";
import { WORKER_CONFIG_TOKEN, type WorkerConfig } from "./config/workerConfig.ts";
import {
  connectDatabase,
  DATABASE_CONFIG_TOKEN,
  rootLogger,
  type DatabaseConfig,
} from "@vendpire/platform/server";

/**
 * Worker entrypoint: the third Cloud Run service and the app's background
 * job-execution home. It shares the whole backend (repositories, integration
 * adapters, config) with the api through `@vendpire/platform` and adds only
 * transport — running work off a queue, plus the inbound endpoints that enqueue
 * it.
 *
 * Webhook ingestion (Clerk) is the first workload to live here, but the worker
 * is deliberately NOT "the webhook service": future non-webhook jobs (the
 * Cantaloupe CSV import, scheduled report rollups) belong here too, as new
 * handler families under `jobs/handlers/` and, if they need an inbound trigger,
 * new routes — no new package.
 *
 * Ingestion lives here rather than in the api for a concrete reason too:
 * `Bun.serve` hands the fetch handler a web `Request`, which is exactly what
 * signature verification needs. The api runs tRPC's `createHTTPServer` over
 * `node:http`, where an unread `Request` would have to be hand-built from a
 * buffered body.
 */
// A crash anywhere leaves a structured line before the process dies, so Cloud
// Run / Error Reporting has something to show. Registered before boot.
installGlobalErrorHandlers();

const main = async (): Promise<void> => {
  const { port } = container.resolve<WorkerConfig>(WORKER_CONFIG_TOKEN);
  const { uri } = container.resolve<DatabaseConfig>(DATABASE_CONFIG_TOKEN);

  await connectDatabase(uri);
  rootLogger.info("connected to MongoDB");

  // Resolve the route collaborators once at boot. Resolving the authenticator
  // here is also what makes a misconfigured non-local deploy fail fast: the
  // factory reads the Cloud Tasks config now, at startup, rather than on the
  // first task.
  const handleRequest = createRequestHandler({
    ingest: container.resolve(IngestService),
    runner: container.resolve(JobRunner),
    taskAuth: container.resolve<TaskAuthenticator>(TASK_AUTHENTICATOR_TOKEN),
  });

  const server = Bun.serve({
    port,
    fetch: handleRequest,
  });

  rootLogger.info({ port: server.port }, "worker listening");

  // Cloud Run sends SIGTERM before stopping the instance. Stop accepting new
  // requests but let in-flight jobs finish — a job killed mid-write would be
  // redelivered by Cloud Tasks and re-run, which only the idempotent handlers
  // can absorb safely.
  const shutdown = async (signal: string): Promise<void> => {
    rootLogger.info({ signal }, "draining");
    await server.stop(false);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
};

function installGlobalErrorHandlers(): void {
  process.on("uncaughtException", (err) => {
    rootLogger.fatal({ err }, "uncaught exception");
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    rootLogger.fatal({ err: reason }, "unhandled rejection");
    process.exit(1);
  });
}

main().catch((error) => {
  rootLogger.fatal({ err: error }, "failed to start worker");
  process.exit(1);
});
