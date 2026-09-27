/**
 * Dependency-injection tokens for third-party integration clients. Side-effect-
 * free so a consumer can import a token without triggering DI registration or
 * pulling an SDK into its compile.
 */
export const AUTH_CLIENT_TOKEN = "AuthClient";
export const ANALYTICS_CLIENT_TOKEN = "AnalyticsClient";
export const MAPS_CLIENT_TOKEN = "MapsClient";
// The async-job seam. Only the port + token exist today — the adapter and a
// worker package arrive with the first real consumer (likely Cantaloupe CSV
// import). Registered nowhere yet on purpose.
export const TASK_QUEUE_TOKEN = "TaskQueue";
