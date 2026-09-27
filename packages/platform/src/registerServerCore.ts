import "reflect-metadata"; // MUST be imported before any decorated class is used
import { instanceCachingFactory, type DependencyContainer } from "tsyringe";
import { APP_CONFIG_TOKEN } from "./config/appConfig.ts";
import { loadAppConfig } from "./config/loadAppConfig.ts";
import {
  DATABASE_CONFIG_TOKEN,
  loadDatabaseConfig,
} from "./data-access/databaseConfig.ts";
import {
  CLERK_CONFIG_TOKEN,
  loadClerkConfig,
} from "./integrations/auth/clerkConfig.ts";
import {
  ANALYTICS_CONFIG_TOKEN,
  loadAnalyticsConfig,
} from "./integrations/analytics/analyticsConfig.ts";
import {
  AUTH_CLIENT_TOKEN,
  ANALYTICS_CLIENT_TOKEN,
} from "./integrations/tokens.ts";
import { ClerkClient } from "./integrations/auth/ClerkClient.ts";
import { PostHogClient } from "./integrations/analytics/PostHogClient.ts";
import { LOGGER_TOKEN } from "./logging/Logger.ts";
import { rootLogger } from "./logging/pinoLogger.ts";

/**
 * Wires the shared backend (config slices, integration adapters, and — once
 * Phase 3 adds them — repositories) into a DI container. Called explicitly by
 * each entrypoint's composition root rather than relying on import-time side
 * effects, so a process only registers what it asks for.
 *
 * Config slices are registered as lazy caching factories: a slice's env is read
 * and validated the first time something resolves it, not at registration. So
 * an entrypoint that never resolves, say, the analytics client never validates
 * the analytics env — each process only pays for the config it actually uses.
 */
export function registerServerCore(container: DependencyContainer): void {
  // The root logger is a ready-made value (no env to validate), so registered
  // as-is rather than via a factory. Services/adapters inject LOGGER_TOKEN;
  // entrypoints and request scopes derive children from it.
  container.register(LOGGER_TOKEN, { useValue: rootLogger });

  container.register(APP_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadAppConfig()),
  });
  container.register(DATABASE_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadDatabaseConfig()),
  });
  container.register(CLERK_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadClerkConfig()),
  });
  container.register(ANALYTICS_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadAnalyticsConfig()),
  });

  container.registerSingleton(AUTH_CLIENT_TOKEN, ClerkClient);
  container.registerSingleton(ANALYTICS_CLIENT_TOKEN, PostHogClient);
}
