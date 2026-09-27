/**
 * Canonical names for the server-emitted product-analytics events — the
 * ground-truth actions captured from tRPC mutations (browser-side UI events
 * live in the web package). Referencing these constants instead of raw strings
 * keeps a typo from silently splitting an event in PostHog.
 *
 * Convention: `object.action`, past tense. First real events arrive with the
 * Phase 3 entity mutations.
 */
export const ANALYTICS_EVENTS = {} as const;
