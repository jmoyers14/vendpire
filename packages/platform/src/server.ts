/**
 * Server-only surface: values that pull in Mongoose/SDKs and DI registration.
 * Kept apart from the contract barrel (./index.ts) so type-only consumers (the
 * web client, via the tRPC AppRouter type) never drag server implementations —
 * decorated adapters, Mongoose — into their compile.
 */
export { registerServerCore } from "./registerServerCore.ts";
export { connectDatabase } from "./data-access/connection.ts";
// The pino-backed root logger — server-only (pino pulls Node APIs). Entrypoints
// import it for boot/shutdown logs and global handlers; everything request-
// scoped derives a child from it. The Logger *type* is on the contract barrel.
export { rootLogger } from "./logging/pinoLogger.ts";
// Shared env-parse helper — server-only (it calls process.exit on bad config).
export { parseConfig } from "./config/parseConfig.ts";
// The database connection URI slice — resolved by server entrypoints to open the
// Mongoose connection. Server-only (its loader reads env), so it lives here
// rather than on the contract barrel.
export { DATABASE_CONFIG_TOKEN } from "./data-access/databaseConfig.ts";
export type { DatabaseConfig } from "./data-access/databaseConfig.ts";
