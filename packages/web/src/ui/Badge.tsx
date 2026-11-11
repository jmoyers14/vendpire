import type { ReactNode } from "react";
import type { StatusTone } from "./tone.ts";

export type BadgeTone = StatusTone | "neutral" | "action";
export type BadgeSize = "md" | "sm";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-divider text-muted-strong",
  action: "bg-action-soft text-link",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

const SIZE: Record<BadgeSize, string> = {
  md: "h-6 px-2.5",
  sm: "h-5 px-2",
};

/** A short uppercase label: "Active", "Item", "Pack of 35". */
export const Badge = ({
  tone = "neutral",
  size = "md",
  children,
}: {
  tone?: BadgeTone;
  size?: BadgeSize;
  children: ReactNode;
}) => (
  <span
    className={`inline-flex items-center rounded-full text-overline whitespace-nowrap uppercase ${TONE[tone]} ${SIZE[size]}`}
  >
    {children}
  </span>
);
