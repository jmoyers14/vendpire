/** Render integer cents as "$1.75". */
export const formatCents = (cents: number): string =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Parse a dollars text field ("1.75") to integer cents, or null if invalid. */
export const parseDollarsToCents = (text: string): number | null => {
  const value = Number.parseFloat(text);
  if (Number.isNaN(value) || value < 0) {
    return null;
  }
  return Math.round(value * 100);
};

/** Render basis points as "10%". */
export const formatBps = (bps: number): string => `${(bps / 100).toLocaleString()}%`;

/** Parse a percent text field ("10.5") to basis points, or null if invalid. */
export const parsePercentToBps = (text: string): number | null => {
  const value = Number.parseFloat(text);
  if (Number.isNaN(value) || value <= 0 || value > 100) {
    return null;
  }
  return Math.round(value * 100);
};
