import { createContext, type ReactNode, useContext, useId } from "react";
import { focusRing } from "./focus.ts";

// Form controls are not buttons, so they keep a soft rectangle rather than a
// pill — a fully rounded text input reads as a search box.
const fieldBase = `w-full rounded-xl border border-line bg-card px-3 py-2 text-ink-soft placeholder:text-gray-400 ${focusRing} focus-visible:border-primary-500`;

/** @deprecated Use `<Field>` with `<TextInput>`; kept until every screen migrates. */
export const inputClass = `${fieldBase} text-sm`;

/**
 * The variant for fields you fill in standing at a machine: 16px text, because
 * iOS Safari zooms the whole page when a focused input's text is smaller, and
 * tabular digits so counts line up down a column.
 *
 * @deprecated Use `<NumberInput>`; kept until every screen migrates.
 */
export const countInputClass = `${fieldBase} text-base tabular-nums`;

/** @deprecated Use `<Field label>`. */
export const labelClass = "text-sm font-bold text-gray-800";

/** @deprecated Use `<Field hint>`. */
export const hintClass = "text-xs text-muted";

/** @deprecated Use `<Switch>`. */
export const checkboxClass = `size-4 accent-primary-600 ${focusRing}`;

interface FieldControl {
  id: string;
  describedBy: string | undefined;
  isInvalid: boolean;
}

const FieldContext = createContext<FieldControl | null>(null);

/**
 * The id and descriptions a control inside a `<Field>` should wear. Null
 * outside a Field, where the caller supplies its own id and aria-label.
 */
export const useFieldControl = (): FieldControl | null =>
  useContext(FieldContext);

/**
 * A visible label above one control, with optional hint and error text under
 * it. Placeholders are for examples only, never a stand-in for the label.
 */
export const Field = ({
  label,
  isOptional = false,
  hint,
  error,
  className = "",
  children,
}: {
  label: ReactNode;
  isOptional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={`grid content-start gap-2 ${className}`}>
      <label htmlFor={id} className="flex items-baseline gap-2 text-label text-ink">
        {label}
        {isOptional ? (
          <span className="font-normal text-muted-strong">optional</span>
        ) : null}
      </label>
      <FieldContext.Provider
        value={{ id, describedBy, isInvalid: Boolean(error) }}
      >
        {children}
      </FieldContext.Provider>
      {hint ? (
        <p id={hintId} className="text-body-sm text-muted-strong">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-body-sm font-bold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
};
