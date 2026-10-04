import type { ReactNode } from "react";

// Hairline-divided list of machine slots. Rows come from SlotRow so the three
// columns (code / product / status) stay aligned across the whole list.
export const SlotList = ({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={`divide-y divide-divider rounded-card bg-card shadow-card ${className}`}
  >
    {children}
  </div>
);

export const SlotRow = ({
  code,
  label,
  status,
}: {
  code: ReactNode;
  label: ReactNode;
  status?: ReactNode;
}) => (
  <div className="grid grid-cols-[36px_1fr_auto] items-center gap-2.5 px-3 py-2.5 text-sm">
    <span className="font-mono text-xs text-muted">{code}</span>
    <span className="truncate text-body">{label}</span>
    {status ?? <span />}
  </div>
);
