import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { controlClass, useControlAria } from "./TextInput.tsx";

/**
 * `sm` sits in a table row, `md` is a form field, `lg` is the big count input
 * you fill in at the machine.
 */
export type NumberInputSize = "sm" | "md" | "lg";

const SIZE: Record<NumberInputSize, string> = {
  sm: "h-11 text-base",
  md: "h-12 text-xl",
  lg: "h-14 text-2xl",
};

const PREFIX_PADDING: Record<NumberInputSize, string> = {
  sm: "pl-7",
  md: "pl-8.5",
  lg: "pl-9",
};

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size" | "type" | "inputMode" | "prefix"
> & {
  size?: NumberInputSize;
  /** Shown inside the left edge, e.g. "$". */
  prefix?: ReactNode;
  /** Shown inside the right edge, e.g. "/ 10" or "units". */
  suffix?: ReactNode;
};

const AffixedInput = forwardRef<
  HTMLInputElement,
  NumberInputProps & { inputMode: "numeric" | "decimal" }
>(({ size = "md", prefix, suffix, className = "", ...rest }, ref) => {
  const aria = useControlAria(rest);
  const padding = [
    prefix ? PREFIX_PADDING[size] : "pl-3.5",
    suffix ? "pr-16" : "pr-3.5",
  ].join(" ");

  return (
    <div className="relative w-full">
      {prefix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-lg text-muted-strong"
        >
          {prefix}
        </span>
      ) : null}
      <input
        ref={ref}
        type="text"
        // Password managers read numeric fields as card or one-time-code
        // fields and pop their autofill over the count.
        autoComplete="off"
        data-1p-ignore=""
        data-lpignore="true"
        {...rest}
        {...aria}
        className={`${controlClass} ${SIZE[size]} ${padding} font-mono font-medium tabular-nums ${className}`}
      />
      {suffix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 font-mono text-body-sm text-muted-strong"
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
});
AffixedInput.displayName = "AffixedInput";

/** Whole-number entry: counts, quantities, units. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (props, ref) => <AffixedInput ref={ref} inputMode="numeric" {...props} />,
);
NumberInput.displayName = "NumberInput";

/** Decimal entry without a currency: a percent, a rate. */
export const DecimalInput = forwardRef<HTMLInputElement, NumberInputProps>((props, ref) => (
  <AffixedInput ref={ref} inputMode="decimal" {...props} />
));
DecimalInput.displayName = "DecimalInput";

/** Dollar entry. The value stays a string; parse it with utils/money. */
export const MoneyInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ prefix = "$", ...props }, ref) => (
    <AffixedInput ref={ref} inputMode="decimal" prefix={prefix} {...props} />
  ),
);
MoneyInput.displayName = "MoneyInput";
