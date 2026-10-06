/**
 * Contract surface of the shared backend layer: tokens, ports, and (from Phase 3)
 * entity/input types — no values that pull in Mongoose or SDKs. Safe for
 * type-only consumers (the web client resolves these through the tRPC AppRouter
 * type). Server-only values (registerServerCore, connectDatabase) live in
 * ./server.ts.
 */

// Config: the app-identity slice (environment + build stamp). AppConfig rides on
// the tRPC Context, so only its zod-free type module is exposed here. The other
// slices (database, clerk, analytics) and the parse helper are server-only —
// they read env / call process.exit — so they stay off the contract barrel and
// never reach the web client.
export * from "./config/appConfig.ts";

// Data-access: tokens and repository ports (each re-exports its own entity/input
// types).
export * from "./data-access/tokens.ts";
export * from "./data-access/repositories/LocationRepository/LocationRepository.ts";
export * from "./data-access/repositories/MachineRepository/MachineRepository.ts";
export * from "./data-access/repositories/MachineTemplateRepository/MachineTemplateRepository.ts";
export * from "./data-access/repositories/ProductRepository/ProductRepository.ts";
export * from "./data-access/repositories/PlanogramRepository/PlanogramRepository.ts";
export * from "./data-access/repositories/PurchaseRepository/PurchaseRepository.ts";
export * from "./data-access/repositories/VisitRepository/VisitRepository.ts";
export * from "./data-access/repositories/PackRepository/PackRepository.ts";
// Platform-infrastructure records (not org-scoped) and the Clerk identity
// mirrors the webhook handlers maintain.
export * from "./data-access/repositories/WebhookEventRepository/WebhookEventRepository.ts";
export * from "./data-access/repositories/JobRepository/JobRepository.ts";
export * from "./data-access/repositories/UserRepository/UserRepository.ts";
export * from "./data-access/repositories/OrganizationRepository/OrganizationRepository.ts";
export * from "./data-access/repositories/OrganizationMembershipRepository/OrganizationMembershipRepository.ts";

// Integrations: tokens and vendor-neutral ports.
export * from "./integrations/tokens.ts";
export * from "./integrations/auth/AuthClient.ts";
export * from "./integrations/analytics/AnalyticsClient.ts";
export * from "./integrations/maps/MapsClient.ts";
export * from "./integrations/productdata/ProductDataClient.ts";
export * from "./integrations/tasks/TaskQueue.ts";
// Webhook verification + the /tasks/* guard: ports and pure helpers only. The
// adapters pull SDKs and are registered from ./webhook, never exported here.
export * from "./integrations/webhooks/WebhookVerifier.ts";
export * from "./integrations/tasks/TaskAuthenticator.ts";

// The job/queue vocabulary: what job kinds exist, which queues they ride, and
// how a task is named and addressed. Shared so the router, the registry, and
// deploy.sh can't drift.
export * from "./jobs/jobTypes.ts";
export * from "./jobs/taskKey.ts";

// Logging: the port + token only. The pino-backed root logger is server-only
// (exported from ./server.ts) so pino never reaches the web client's type graph;
// the Logger interface is what rides on the tRPC Context.
export { type Logger, type LogFn, LOGGER_TOKEN } from "./logging/Logger.ts";
