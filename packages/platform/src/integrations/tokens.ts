/**
 * Dependency-injection tokens for third-party integration clients. Side-effect-
 * free so a consumer can import a token without triggering DI registration or
 * pulling an SDK into its compile.
 */
export const AUTH_CLIENT_TOKEN = "AuthClient";
export const ANALYTICS_CLIENT_TOKEN = "AnalyticsClient";
export const MAPS_CLIENT_TOKEN = "MapsClient";
export const PRODUCT_DATA_CLIENT_TOKEN = "ProductDataClient";
// The async-job seam. Registered by registerTaskQueue (InlineTaskQueue locally,
// CloudTasksQueue everywhere else), which only the worker calls — the api
// enqueues nothing today.
export const TASK_QUEUE_TOKEN = "TaskQueue";

// One verifier per webhook source, so the token is per-source too — a second
// source gets its own token and adapter rather than overloading this one.
export const CLERK_WEBHOOK_VERIFIER_TOKEN = "ClerkWebhookVerifier";

// The guard on the worker's /tasks/* callbacks. The only thing standing between
// those endpoints and the public internet, since the service must stay
// unauthenticated for Clerk's sake.
export const TASK_AUTHENTICATOR_TOKEN = "TaskAuthenticator";
