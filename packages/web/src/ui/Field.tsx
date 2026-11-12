import { createContext, type ReactNode, useContext, useId } from "react";

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
