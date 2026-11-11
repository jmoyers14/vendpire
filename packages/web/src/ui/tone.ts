/**
 * The status vocabulary every component shares, named after the color tokens.
 * Status is never the primary color.
 */
export type StatusTone = "success" | "warning" | "danger";

/**
 * Stock thresholds shared so a slot reads the same everywhere it appears:
 * empty is danger, a third or less is a warning, anything more is fine.
 */
export const stockTone = (remaining: number, capacity: number): StatusTone => {
  if (remaining <= 0) {
    return "danger";
  }
  if (capacity > 0 && remaining / capacity <= 0.3) {
    return "warning";
  }
  return "success";
};
