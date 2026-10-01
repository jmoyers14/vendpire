import { focusRing } from "./focus.ts";

// Form controls are not buttons, so they keep a soft rectangle rather than a
// pill — a fully rounded text input reads as a search box.
export const inputClass = `w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-body placeholder:text-gray-400 ${focusRing} focus-visible:border-primary-500`;

export const labelClass = "text-sm font-bold text-gray-800";

// Inline hint or validation helper under a field.
export const hintClass = "text-xs text-muted";

// Native checkboxes default to the browser's blue; accent-color pulls them onto
// the palette without replacing them with a custom control.
export const checkboxClass = `size-4 accent-primary-600 ${focusRing}`;
