/**
 * Shared scalar conventions, ahead of the Phase 2 entity types:
 * - Money is integer cents (never floats).
 * - Percentages are basis points (1000 = 10%).
 * - Timestamps are ISO-8601 strings in DTOs; Date only inside Mongoose docs.
 */
export type Cents = number;
export type BasisPoints = number;
