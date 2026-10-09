import { focusRing } from "./focus.ts";

// Form controls are not buttons, so they keep a soft rectangle rather than a
// pill — a fully rounded text input reads as a search box.
const fieldBase = `w-full rounded-xl border border-line bg-card px-3 py-2 text-body placeholder:text-gray-400 ${focusRing} focus-visible:border-primary-500`;

export const inputClass = `${fieldBase} text-sm`;

/**
 * The variant for fields you fill in standing at a machine: 16px text, because
 * iOS Safari zooms the whole page when a focused input's text is smaller, and
 * tabular digits so counts line up down a column.
 *
 * Composed from the same base as `inputClass` rather than layering a
 * `text-base` on top of it — two font-size utilities on one element leaves the
 * winner up to stylesheet order.
 */
export const countInputClass = `${fieldBase} text-base tabular-nums`;

export const labelClass = "text-sm font-bold text-gray-800";

// Inline hint or validation helper under a field.
export const hintClass = "text-xs text-muted";

// Native checkboxes default to the browser's blue; accent-color pulls them onto
// the palette without replacing them with a custom control.
export const checkboxClass = `size-4 accent-primary-600 ${focusRing}`;
