import type { ButtonHTMLAttributes, ReactNode } from "react";
import { focusRing } from "./focus.ts";

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "md" | "sm";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800",
  secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
  danger: "bg-red-50 text-red-700 hover:bg-red-100",
};

// `md` is the design system's documented button. `sm` exists for dense contexts
// (table row actions, toolbars) where the full-size control would crowd the row.
const SIZE: Record<ButtonSize, string> = {
  md: "px-5 py-3",
  sm: "px-3.5 py-1.5 text-sm",
};

const BASE =
  "inline-flex items-center justify-center rounded-full font-bold transition-transform active:scale-[.96] motion-reduce:transition-none disabled:opacity-50 disabled:pointer-events-none";

// Buttons are always pills. Exported separately so anchors and router Links can
// wear the same styling without duplicating the class string.
export const buttonClass = ({
  variant = "primary",
  size = "md",
  full = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  className?: string;
} = {}): string =>
  [
    BASE,
    VARIANT[variant],
    SIZE[size],
    focusRing,
    full ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  children: ReactNode;
};

export const Button = ({
  variant = "primary",
  size = "md",
  full = false,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    className={buttonClass({ variant, size, full, className })}
    {...rest}
  >
    {children}
  </button>
);
