/**
 * Test-only builders, shared across packages. Exported from its own subpath
 * (`@vendpire/platform/test-support`) so production code can't reach for a
 * fixture by accident.
 */
export * from "./factories.ts";
