/** Cents to "$12.34". Negative reads "-$12.34", never "$-12.34". */
export const formatMoney = (cents: number): string => {
  const sign = cents < 0 ? "-" : "";
  const magnitude = Math.abs(cents);
  const whole = Math.floor(magnitude / 100);
  const fraction = String(magnitude % 100).padStart(2, "0");
  return `${sign}$${whole}.${fraction}`;
};

/**
 * The single most important function here. A null cost is NOT zero, and a model
 * handed `0` will cheerfully report "$0.00 of COGS" as if the business bought
 * its stock for nothing. Every nullable money figure goes through this.
 */
export const formatMoneyOrUnknown = (cents: number | null): string =>
  cents === null ? "unknown" : formatMoney(cents);

/** The calendar day of an ISO instant, in UTC. */
export const formatDay = (iso: string): string => iso.slice(0, 10);

export const pluralize = (count: number, singular: string): string =>
  `${count} ${singular}${count === 1 ? "" : "s"}`;
