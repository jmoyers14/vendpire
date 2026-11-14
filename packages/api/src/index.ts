import http from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { createOpenApiHttpHandler } from "trpc-to-openapi";
import { appRouter } from "./router.ts";
import { createContext } from "./createContext.ts";
import {
  container,
  AUTH_SERVICE_TOKEN,
  BARCODE_RESOLVER_SERVICE_TOKEN,
  LOCATION_SERVICE_TOKEN,
  MACHINE_SERVICE_TOKEN,
  MOBILE_CLIENT_SUPPORT_SERVICE_TOKEN,
  PRODUCT_SERVICE_TOKEN,
  PNL_SERVICE_TOKEN,
  PURCHASE_SERVICE_TOKEN,
  VISIT_SERVICE_TOKEN,
} from "./services/index.ts";
import { SERVER_CONFIG_TOKEN, type ServerConfig } from "./config/serverConfig.ts";
import type { MobileClientSupportService } from "./services/MobileClientSupportService/MobileClientSupportService.ts";
import { MCP_CONFIG_TOKEN, type McpConfig } from "./config/mcpConfig.ts";
import type { AuthService } from "./services/AuthService/AuthService.ts";
import { buildHttpMiddleware } from "./middleware/index.ts";
import {
  buildMcpHttpHandler,
  type McpHttpHandler,
} from "./mcp/buildMcpHttpHandler.ts";
import type { AgentServices } from "./mcp/tools/index.ts";
import type { MachineService } from "./services/MachineService/MachineService.ts";
import type { LocationService } from "./services/LocationService/LocationService.ts";
import type { ProductService } from "./services/ProductService/ProductService.ts";
import type { PurchaseService } from "./services/PurchaseService/PurchaseService.ts";
import type { VisitService } from "./services/VisitService/VisitService.ts";
import type { PnlService } from "./services/PnlService/PnlService.ts";
import type { BarcodeResolverService } from "./services/BarcodeResolverService/BarcodeResolverService.ts";
import { ANALYTICS_CLIENT_TOKEN, APP_CONFIG_TOKEN } from "@vendpire/platform";
import type { AnalyticsClient, AppConfig, Logger } from "@vendpire/platform";
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
  const mcpHandler = buildMcpHandlerIfConfigured();

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
      if (mcpHandler?.handles(req.url ?? "/") === true) {
        void mcpHandler.handle(req, res);
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

function buildMcpHandlerIfConfigured(): McpHttpHandler | null {
  const config = container.resolve<McpConfig | null>(MCP_CONFIG_TOKEN);
  if (config === null) {
    rootLogger.info("MCP endpoint disabled: MCP_RESOURCE_URL not set");
    return null;
  }
  rootLogger.info({ resourceUrl: config.resourceUrl }, "MCP endpoint enabled");
  return buildMcpHttpHandler({
    config,
    authService: container.resolve<AuthService>(AUTH_SERVICE_TOKEN),
    services: resolveAgentServices(),
    log: rootLogger,
    version: container.resolve<AppConfig>(APP_CONFIG_TOKEN).version,
  });
}

/** The read tools' dependencies, resolved from the same singletons the router uses. */
function resolveAgentServices(): AgentServices {
  return {
    machineService: container.resolve<MachineService>(MACHINE_SERVICE_TOKEN),
    locationService: container.resolve<LocationService>(LOCATION_SERVICE_TOKEN),
    productService: container.resolve<ProductService>(PRODUCT_SERVICE_TOKEN),
    purchaseService: container.resolve<PurchaseService>(PURCHASE_SERVICE_TOKEN),
    visitService: container.resolve<VisitService>(VISIT_SERVICE_TOKEN),
    pnlService: container.resolve<PnlService>(PNL_SERVICE_TOKEN),
    barcodeResolverService: container.resolve<BarcodeResolverService>(
      BARCODE_RESOLVER_SERVICE_TOKEN,
    ),
  };
}

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
