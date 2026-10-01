import type { ReactNode } from "react";

export type Tone = "ok" | "warning" | "critical";

const TONE: Record<Tone, string> = {
  ok: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

// Status is never the primary color — green/amber/red carry all state meaning.
export const StatusPill = ({
  tone,
  className = "",
  children,
}: {
  tone: Tone;
  className?: string;
  children: ReactNode;
}) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap ${TONE[tone]} ${className}`}
  >
    {children}
  </span>
);

// Shared stock thresholds so a slot reads the same everywhere it appears:
// empty is critical, a third or less is a warning, anything more is fine.
export const stockTone = (remaining: number, capacity: number): Tone => {
  if (remaining <= 0) {
    return "critical";
  }
  if (capacity > 0 && remaining / capacity <= 0.3) {
    return "warning";
  }
  return "ok";
};
