import { type ReactNode, useId } from "react";

/**
 * An on/off setting as a title, a one-line description and a switch. A real
 * checkbox sits under the track, so it submits, labels and toggles with Space
 * like any checkbox.
 */
export const Switch = ({
  title,
  description,
  isChecked,
  onChange,
  isDisabled = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
  isDisabled?: boolean;
}) => {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div className="flex items-start justify-between gap-6 py-1">
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-body font-bold text-ink">
          {title}
        </label>
        {description ? (
          <p
            id={descriptionId}
            className="max-w-[480px] text-body-sm text-muted-strong"
          >
            {description}
          </p>
        ) : null}
      </div>
      <span className="relative mt-0.5 h-7 w-12 flex-none">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={isChecked}
          disabled={isDisabled}
          aria-describedby={description ? descriptionId : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-field transition-colors peer-checked:bg-action peer-disabled:bg-disabled peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus motion-reduce:transition-none"
        />
        <span
          aria-hidden
          className="absolute top-[3px] left-[3px] size-[22px] rounded-full bg-card shadow-card transition-transform peer-checked:translate-x-5 motion-reduce:transition-none"
        />
      </span>
    </div>
  );
};
