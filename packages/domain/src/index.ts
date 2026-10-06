/**
 * Pure domain logic shared by the api, web, and (via ported fixtures) the iOS
 * app: entity types and the calculation engine (units sold, weighted-average
 * unit cost, revenue/COGS/profit rollups). No I/O, no Mongoose, no SDKs —
 * this package must stay runnable in the browser as-is.
 *
 * The engine derives everything at read time from two streams of observations:
 * a machine's ordered visit sequence, and the org's purchase lines. Nothing
 * derived is ever persisted, so a late receipt corrects history by itself.
 * Worked examples: `docs/diagrams/visit-calculations.md`.
 */
export * from "./types/index.ts";
export * from "./gtin/gtin.ts";
export * from "./money/allocate.ts";
export * from "./machines/slots.ts";
export * from "./visits/types.ts";
export * from "./visits/removals.ts";
export * from "./visits/anomalies.ts";
export * from "./visits/sold.ts";
export * from "./costs/unitCost.ts";
export * from "./pnl/pnl.ts";
