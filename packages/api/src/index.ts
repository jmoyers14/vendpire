import http from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { createOpenApiHttpHandler } from "trpc-to-openapi";
import { appRouter } from "./router.ts";
import { createContext } from "./createContext.ts";
import {
  container,
  MOBILE_CLIENT_SUPPORT_SERVICE_TOKEN,
} from "./services/index.ts";
import { SERVER_CONFIG_TOKEN, type ServerConfig } from "./config/serverConfig.ts";
import type { MobileClientSupportService } from "./services/MobileClientSupportService/MobileClientSupportService.ts";
import { buildHttpMiddleware } from "./middleware/index.ts";
import { ANALYTICS_CLIENT_TOKEN } from "@vendpire/platform";
import type { AnalyticsClient, Logger } from "@vendpire/platform";
import {
  connectDatabase,
  DATABASE_CONFIG_TOKEN,
  rootLogger,
  type DatabaseConfig,
} from "@vendpire/platform/server";

/** The `/api/v1` mount point. Stripped before the REST handler sees the URL. */
const API_V1_PREFIX = "/api/v1";

interface TrpcErrorReport {
  error: { code: string; cause?: unknown };
  path?: string | undefined;
  ctx?: { log?: Logger } | undefined;
}

/**
 * Shared by both handlers — a separately-mounted one does not inherit the
 * adapter's onError. INTERNAL_SERVER_ERROR is an unhandled bug and logs at
 * error with the cause's stack; handled domain errors log at warn so error
 * tracking isn't flooded by 4xxs.
 */
const logRequestError = ({ error, path, ctx }: TrpcErrorReport): void => {
  const log = ctx?.log ?? rootLogger;
  if (error.code === "INTERNAL_SERVER_ERROR") {
    log.error(
      { path, code: error.code, err: error.cause ?? error },
      "unhandled request error",
    );
  } else {
    log.warn({ path, code: error.code }, "request error");
  }
};

// A crash anywhere leaves a structured line before the process dies, so the
// host's log explorer has something to show. Registered before boot.
installGlobalErrorHandlers();

const main = async (): Promise<void> => {
  const { port, webUrl } = container.resolve<ServerConfig>(SERVER_CONFIG_TOKEN);
  const { uri } = container.resolve<DatabaseConfig>(DATABASE_CONFIG_TOKEN);
  const clientSupport = container.resolve<MobileClientSupportService>(
    MOBILE_CLIENT_SUPPORT_SERVICE_TOKEN,
  );

  await connectDatabase(uri);
  rootLogger.info("connected to MongoDB");

  const trpcHandler = createHTTPHandler({
    router: appRouter,
    createContext,
    onError: logRequestError,
  });
  const restHandler = createOpenApiHttpHandler({
    router: appRouter,
    createContext,
    onError: logRequestError,
  });
  const runHttpMiddleware = buildHttpMiddleware({ webUrl, clientSupport });

  // One server. The middleware runs on the UNREWRITTEN url — the 426 gate
  // exempts "/api/v1/client-support" by full path, so the strip must stay
  // inside the branch below.
  const server = http.createServer((req, res) => {
    runHttpMiddleware(req, res, (err?: unknown) => {
      if (err !== undefined && err !== null) {
        rootLogger.error({ err }, "middleware error");
        res.statusCode = 500;
        res.end();
        return;
      }
      if (req.url?.startsWith(API_V1_PREFIX) === true) {
        req.url = req.url.slice(API_V1_PREFIX.length) || "/";
        void restHandler(req, res);
        return;
      }
      void trpcHandler(req, res);
    });
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
