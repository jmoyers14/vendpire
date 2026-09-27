import type {
  AnalyticsClient,
  AppConfig,
  AuthIdentity,
  Logger,
} from "@vendpire/platform";

/**
 * Authenticated principal for a request — the provider-neutral identity the
 * AuthClient returns after verifying a session token. `orgId`/`orgRole` are
 * populated only when the user has an active organization; vendpire maps the
 * Clerk organization onto the business, so orgId is the business boundary.
 */
export type AuthContext = AuthIdentity;

/**
 * Request context type. This module imports only service *interfaces* (no DI
 * container, decorators, or runtime globals) so the client can consume the
 * AppRouter type without pulling the server implementation into its compile.
 */
export interface Context {
  auth: AuthContext | null;
  /**
   * Product-analytics sink. Lives beside `services` rather than inside it
   * because capture is a cross-cutting side effect fired at the procedure
   * layer, not domain logic.
   */
  analytics: AnalyticsClient;
  /** Process-wide app identity (environment + build stamp). Read by the system router. */
  appConfig: AppConfig;
  /**
   * Request-scoped logger — the root logger with requestId/orgId/userId already
   * bound, so every line it writes correlates to this request. Typed as the
   * vendor-neutral Logger port, so the web client (which resolves this Context
   * via AppRouter) never sees pino.
   */
  log: Logger;
  /** Entity services arrive in Phase 3 (locations, machines, products, …). */
  services: Record<never, never>;
}
