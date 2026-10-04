import { focusRing } from "./focus.ts";

/**
 * A small "i" beside a field label that reveals an explanation on hover or
 * keyboard focus. For context that would otherwise become a line of helper
 * text under every field — useful once, clutter on every later visit.
 *
 * The text is also the button's accessible name, so it reaches a screen reader
 * without depending on the visual tooltip being rendered.
 */
export const InfoHint = ({ text }: { text: string }) => (
  <span className="group relative inline-flex align-middle">
    <button
      type="button"
      aria-label={text}
      className={`inline-flex size-4 items-center justify-center rounded-full border border-gray-400 text-[10px] font-bold leading-none text-gray-500 hover:border-primary-500 hover:text-primary-600 ${focusRing}`}
    >
      i
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-xl bg-gray-900 px-2.5 py-1.5 text-xs leading-snug font-normal text-white opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
    >
      {text}
    </span>
  </span>
);
