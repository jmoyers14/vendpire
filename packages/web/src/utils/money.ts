/**
 * Money and percentage conversions. Amounts are stored as integers — cents for
 * money, basis points for rates — so every boundary with a text field goes
 * through here rather than scattering `/ 100` across the screens.
 */

const CENTS_PER_DOLLAR = 100;
const BPS_PER_PERCENT = 100;

/** Render integer cents as "$1.75". */
export const formatCents = (cents: number): string =>
  (cents / CENTS_PER_DOLLAR).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

/**
 * Render integer cents with an explicit sign, for a figure that can go either
 * way — profit, margin, a variance. Uses a true minus sign (U+2212) rather
 * than a hyphen, which is what the design system's money rule asks for.
 *
 * Zero gets no sign: "+$0.00" reads as a gain that didn't happen.
 */
export const formatSignedCents = (cents: number): string => {
  if (cents === 0) {
    return formatCents(0);
  }
  return `${cents > 0 ? "+" : "\u2212"}${formatCents(Math.abs(cents))}`;
};

/**
 * Render integer cents as the bare dollars string a text input holds ("1.75").
 * Unlike formatCents there's no symbol or grouping — those would not survive a
 * round trip back through parseDollarsToCents.
 */
export const centsToInput = (cents: number): string =>
  String(cents / CENTS_PER_DOLLAR);

/** Parse a dollars text field ("1.75") to integer cents, or null if invalid. */
export const parseDollarsToCents = (text: string): number | null => {
  const value = Number.parseFloat(text);
  if (Number.isNaN(value) || value < 0) {
    return null;
  }
  return Math.round(value * CENTS_PER_DOLLAR);
};

/** Render basis points as "10%". */
export const formatBps = (bps: number): string =>
  `${(bps / BPS_PER_PERCENT).toLocaleString()}%`;

/** Render basis points as the bare percent string a text input holds ("10.5"). */
export const bpsToInput = (bps: number): string => String(bps / BPS_PER_PERCENT);

/** Parse a percent text field ("10.5") to basis points, or null if invalid. */
export const parsePercentToBps = (text: string): number | null => {
  const value = Number.parseFloat(text);
  if (Number.isNaN(value) || value <= 0 || value > 100) {
    return null;
  }
  return Math.round(value * BPS_PER_PERCENT);
};
