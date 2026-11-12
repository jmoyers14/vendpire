import { useId } from "react";
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
  isLabelVisible = false,
  options,
  value,
  onChange,
}: {
  /** Accessible name for the group, e.g. "Reason". */
  label: string;
  /** Shows `label` above the chips, for a group that stands on its own like a filter. */
  isLabelVisible?: boolean;
  options: ChipOption<Value>[];
  value: Value | null;
  onChange: (value: Value) => void;
}) => {
  const labelId = useId();
  const group = (
    <div
      role="group"
      aria-label={isLabelVisible ? undefined : label}
      aria-labelledby={isLabelVisible ? labelId : undefined}
      className="flex flex-wrap gap-2"
    >
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
  if (!isLabelVisible) {
    return group;
  }
  return (
    <div className="grid gap-2">
      <span id={labelId} className="text-label text-ink">
        {label}
      </span>
      {group}
    </div>
  );
};
