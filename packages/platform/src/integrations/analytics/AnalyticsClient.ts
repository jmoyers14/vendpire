/**
 * A single product-analytics event. `distinctId` ties the event to a user
 * (we use the Clerk userId so server- and browser-side events fuse onto one
 * person), and `groupId` is the org/tenant the action happened in.
 */
export interface AnalyticsEvent {
  event: string;
  distinctId: string;
  groupId?: string;
  properties?: Record<string, unknown>;
}

/**
 * Port for product analytics. Named by capability, not vendor — the PostHog
 * adapter implements it, and nothing else in the app imports a PostHog SDK.
 *
 * `capture` is fire-and-forget by design: analytics is a side effect at the
 * edge of a request and must never block or fail the user's action. `shutdown`
 * flushes any buffered events so an exiting process doesn't drop them.
 */
export interface AnalyticsClient {
  capture(event: AnalyticsEvent): void;
  shutdown(): Promise<void>;
}
