/**
 * Canonical names for the server-emitted product-analytics events — the
 * ground-truth actions captured from tRPC mutations (browser-side UI events
 * live in the web package). Referencing these constants instead of raw strings
 * keeps a typo from silently splitting an event in PostHog.
 *
 * Convention: `object.action`, past tense.
 */
export const ANALYTICS_EVENTS = {
  LOCATION_CREATED: "location.created",
  MACHINE_CREATED: "machine.created",
  PRODUCT_CREATED: "product.created",
  PLANOGRAM_CREATED: "planogram.created",
  PURCHASE_CREATED: "purchase.created",
  PACK_CREATED: "pack.created",
} as const;
