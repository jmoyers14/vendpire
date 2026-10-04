import type { ApiLocation } from "../../apiTypes.ts";
import { formatBps, formatCents } from "../../utils/money.ts";

/**
 * What a location is owed, and how to read it. The server models this as a
 * union, so each arm carries exactly its own payload — there is no such thing
 * as a percent commission without a rate, and nothing here null-checks for one.
 */
export type Commission = ApiLocation["commission"];
export type PercentCommission = Extract<Commission, { type: "percent" }>;
export type FlatCommission = Extract<Commission, { type: "flat" }>;

export const isPercentCommission = (
  commission: Commission,
): commission is PercentCommission => commission.type === "percent";

export const isFlatCommission = (
  commission: Commission,
): commission is FlatCommission => commission.type === "flat";

/** One-line summary for a list row: "10% of gross", "$50.00 flat", "None". */
export const commissionLabel = (commission: Commission): string => {
  if (isPercentCommission(commission)) {
    return `${formatBps(commission.percentBps)} of ${commission.basis}`;
  }
  if (isFlatCommission(commission)) {
    return `${formatCents(commission.flatCents)} flat`;
  }
  return "None";
};
