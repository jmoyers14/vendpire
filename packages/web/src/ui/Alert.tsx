import type { ReactNode } from "react";
import type { StatusTone } from "./tone.ts";

const TONE: Record<StatusTone, string> = {
  warning: "border-warning-indicator bg-warning-soft text-warning",
  danger: "border-danger-indicator bg-danger-soft text-danger",
  success: "border-success-indicator bg-success-soft text-success",
};

// A bold title line with optional detail underneath, and an optional action
// on the right ("Fix A4", "Cancel"). The grid (rather than margins) keeps the
// two lines tight regardless of font metrics.
export const Alert = ({
  tone,
  title,
  action,
  className = "",
  children,
}: {
  tone: StatusTone;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) => (
  <div
    className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card border px-3.5 py-3 text-body-sm ${TONE[tone]} ${className}`}
  >
    <div className="grid min-w-0 gap-0.5">
      <p className="font-bold">{title}</p>
      {children ? <div className="text-ink-soft">{children}</div> : null}
    </div>
    {action ? <div className="flex flex-none items-center gap-2">{action}</div> : null}
  </div>
);

// Mutation/query failures render as a critical alert. Returns null when there
// is nothing to report so callers can drop it in unconditionally.
export const ErrorNote = ({ message }: { message: string | null }) =>
  message ? <Alert tone="danger" title={message} /> : null;
