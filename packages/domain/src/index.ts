/**
 * Pure domain logic shared by the api, web, and (via ported fixtures) the iOS
 * app: entity types and the calculation engine (units sold, weighted-average
 * unit cost, revenue/commission/profit rollups). No I/O, no Mongoose, no SDKs —
 * this package must stay runnable in the browser as-is.
 */
export * from "./types/index.ts";
export * from "./gtin/gtin.ts";
export * from "./money/allocate.ts";
export * from "./machines/slots.ts";
