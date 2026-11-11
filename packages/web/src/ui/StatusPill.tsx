import type { ReactNode } from "react";
import type { StatusTone } from "./tone.ts";

const TONE: Record<StatusTone, string> = {
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
};

// Status is never the primary color — green/amber/red carry all state meaning.
export const StatusPill = ({
  tone,
  className = "",
  children,
}: {
  tone: StatusTone;
  className?: string;
  children: ReactNode;
}) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap ${TONE[tone]} ${className}`}
  >
    {children}
  </span>
);
