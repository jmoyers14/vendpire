import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { container, AUTH_SERVICE_TOKEN } from "./services/index.ts";
import {
  ANALYTICS_CLIENT_TOKEN,
  APP_CONFIG_TOKEN,
  LOGGER_TOKEN,
} from "@vendpire/platform";
import type { AnalyticsClient, AppConfig, Logger } from "@vendpire/platform";
import type { AuthService } from "./services/AuthService/AuthService.ts";
import type { Context } from "./context.ts";

/**
 * Runs per request. Authenticates the caller via AuthService and resolves the
 * services each procedure needs from the DI container. Lives apart from the
 * Context type so only the server entry imports the container.
 */
export async function createContext(
  opts: CreateHTTPContextOptions,
): Promise<Context> {
  const authService = container.resolve<AuthService>(AUTH_SERVICE_TOKEN);
  const auth = await authService.authenticate(opts.req.headers.authorization);

  // One correlating id per request, plus the caller's org/user once known, so a
  // request's log lines group together.
  const log = container.resolve<Logger>(LOGGER_TOKEN).child({
    requestId: crypto.randomUUID(),
    orgId: auth?.orgId ?? null,
    userId: auth?.userId ?? null,
  });

  return {
    auth,
    log,
    analytics: container.resolve<AnalyticsClient>(ANALYTICS_CLIENT_TOKEN),
    appConfig: container.resolve<AppConfig>(APP_CONFIG_TOKEN),
    services: {},
  };
}
