import cors from "cors";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router.ts";
import { createContext } from "./createContext.ts";
import { container } from "./services/index.ts";
import { SERVER_CONFIG_TOKEN, type ServerConfig } from "./config/serverConfig.ts";
import { ANALYTICS_CLIENT_TOKEN } from "@vendpire/platform";
import type { AnalyticsClient } from "@vendpire/platform";
import {
  connectDatabase,
  DATABASE_CONFIG_TOKEN,
  rootLogger,
  type DatabaseConfig,
} from "@vendpire/platform/server";

// A crash anywhere leaves a structured line before the process dies, so the
// host's log explorer has something to show. Registered before boot.
installGlobalErrorHandlers();

const main = async (): Promise<void> => {
  const { port, webUrl } = container.resolve<ServerConfig>(SERVER_CONFIG_TOKEN);
  const { uri } = container.resolve<DatabaseConfig>(DATABASE_CONFIG_TOKEN);

  await connectDatabase(uri);
  rootLogger.info("connected to MongoDB");

  const server = createHTTPServer({
    router: appRouter,
    createContext,
    // The single place request errors are logged. Uses the request-scoped child
    // (with orgId/userId/requestId) when the context was built, else the root.
    // INTERNAL_SERVER_ERROR is an unhandled bug — log at error with the original
    // cause's stack; everything else is a handled domain error (NOT_FOUND,
    // FORBIDDEN, …) and logs at warn so error tracking isn't flooded by 4xxs.
    onError: ({ error, path, ctx }) => {
      const log = ctx?.log ?? rootLogger;
      if (error.code === "INTERNAL_SERVER_ERROR") {
        log.error(
          { path, code: error.code, err: error.cause ?? error },
          "unhandled request error",
        );
      } else {
        log.warn({ path, code: error.code }, "request error");
      }
    },
    middleware: cors({ origin: webUrl, credentials: true }),
  });

  server.listen(port);
  rootLogger.info({ port }, "API listening");

  // The host sends SIGTERM before stopping the instance — flush buffered
  // analytics so the last batch of events isn't lost on shutdown.
  const analytics = container.resolve<AnalyticsClient>(ANALYTICS_CLIENT_TOKEN);
  const shutdown = async (signal: string): Promise<void> => {
    rootLogger.info({ signal }, "shutting down, flushing analytics");
    await analytics.shutdown().catch(() => {});
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
  rootLogger.fatal({ err: error }, "failed to start server");
  process.exit(1);
});
