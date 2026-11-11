import type { ReactNode } from "react";
import type { StatusTone } from "./tone.ts";

const TONE: Record<StatusTone, string> = {
  warning: "bg-amber-50 border-amber-200 text-amber-900",
  danger: "bg-red-50 border-red-200 text-red-900",
  success: "bg-green-50 border-green-200 text-green-900",
};

// A bold title line with optional detail underneath. The grid (rather than
// margins) keeps the two lines tight regardless of font metrics.
export const Alert = ({
  tone,
  title,
  className = "",
  children,
}: {
  tone: StatusTone;
  title: ReactNode;
  className?: string;
  children?: ReactNode;
}) => (
  <div
    className={`grid gap-0.5 rounded-card border px-3.5 py-3 text-sm ${TONE[tone]} ${className}`}
  >
    <p className="font-bold">{title}</p>
    {children ? <div>{children}</div> : null}
  </div>
);

// Mutation/query failures render as a critical alert. Returns null when there
// is nothing to report so callers can drop it in unconditionally.
export const ErrorNote = ({ message }: { message: string | null }) =>
  message ? <Alert tone="danger" title={message} /> : null;
