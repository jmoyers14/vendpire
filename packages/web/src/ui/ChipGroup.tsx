import { focusRing } from "./focus.ts";

export interface ChipOption<Value extends string> {
  value: Value;
  label: string;
}

/**
 * Pick one of a few short options, like a removal reason. Toggle buttons with
 * aria-pressed rather than radios: every option stays one Tab stop away.
 */
export const ChipGroup = <Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** Accessible name for the group, e.g. "Reason". */
  label: string;
  options: ChipOption<Value>[];
  value: Value | null;
  onChange: (value: Value) => void;
}) => (
  <div role="group" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
        className={`h-10 rounded-full border border-field bg-card px-4 text-label text-ink hover:border-action aria-pressed:border-action aria-pressed:bg-action aria-pressed:text-on-action ${focusRing}`}
      >
        {option.label}
      </button>
    ))}
  </div>
);
