import type { ButtonHTMLAttributes, ReactNode } from "react";
import { focusRing } from "./focus.ts";

/**
 * One `primary` per view; everything else is `secondary` or `text`. `danger` is
 * for confirming a destructive action, never a page's main action.
 */
export type ButtonVariant = "primary" | "secondary" | "text" | "danger";
export type ButtonSize = "md" | "sm" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-action text-on-action hover:bg-action-hover",
  secondary:
    "border border-line-strong bg-card text-link hover:border-action hover:bg-app",
  text: "text-link hover:underline",
  danger:
    "border border-danger-indicator bg-danger-soft text-danger hover:border-danger",
};

// `lg` matches a 48px input it sits beside ("Look up", "Add"). `sm` is for
// dense contexts like table row actions.
const SIZE: Record<ButtonSize, string> = {
  md: "h-11 px-5 text-button",
  sm: "h-9 px-3.5 text-label",
  lg: "h-12 px-5 text-button",
};

// The text variant has no box to size, so it only takes the type size.
const TEXT_SIZE: Record<ButtonSize, string> = {
  md: "px-2 py-1 text-button",
  sm: "px-1.5 py-0.5 text-label",
  lg: "px-2 py-1.5 text-button",
};

// Disabled is a neutral fill, not a faded teal: a faded primary still reads
// as the thing to press.
const DISABLED_BOX =
  "disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-on-disabled";
const DISABLED_TEXT =
  "disabled:cursor-not-allowed disabled:text-on-disabled disabled:no-underline";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition-colors motion-reduce:transition-none";

// Exported separately so anchors and router Links can wear the same styling
// without duplicating the class string.
export const buttonClass = ({
  variant = "primary",
  size = "md",
  isFullWidth = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isFullWidth?: boolean;
  className?: string;
} = {}): string => {
  const isText = variant === "text";
  return [
    BASE,
    VARIANT[variant],
    // Every button is a pill, text buttons included: it's the shape their focus ring takes.
    `rounded-full ${isText ? TEXT_SIZE[size] : SIZE[size]}`,
    isText ? DISABLED_TEXT : DISABLED_BOX,
    focusRing,
    isFullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isFullWidth?: boolean;
  children: ReactNode;
};

export const Button = ({
  variant = "primary",
  size = "md",
  isFullWidth = false,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    className={buttonClass({ variant, size, isFullWidth, className })}
    {...rest}
  >
    {children}
  </button>
);

const ICON_TONE = {
  neutral: "text-muted-strong hover:bg-action-soft hover:text-link",
  danger: "text-muted-strong hover:bg-danger-soft hover:text-danger",
} as const;

/** A round, icon-only button. `label` is required because there's no text. */
export const IconButton = ({
  label,
  tone = "neutral",
  className = "",
  type = "button",
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  tone?: keyof typeof ICON_TONE;
  children: ReactNode;
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={`inline-flex size-9 flex-none items-center justify-center rounded-full ${ICON_TONE[tone]} ${DISABLED_TEXT} ${focusRing} ${className}`}
    {...rest}
  >
    {children}
  </button>
);
