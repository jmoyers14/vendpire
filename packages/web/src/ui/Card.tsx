import type { ReactNode } from "react";

// Generously rounded white surface on the gray page background.
export const Card = ({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div className={`rounded-card bg-card shadow-card ${className}`}>
    {children}
  </div>
);

export const CardTitle = ({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <h2 className={`font-display text-lg font-extrabold text-heading ${className}`}>
    {children}
  </h2>
);

export type KpiTone = "neutral" | "profit" | "loss";

const KPI_TONE: Record<KpiTone, string> = {
  neutral: "text-heading",
  profit: "text-profit",
  loss: "text-loss",
};

// Label over value. Values are tabular so a row of KPIs lines up on the digits.
export const KpiCard = ({
  label,
  value,
  tone = "neutral",
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: KpiTone;
}) => (
  <Card className="grid gap-0.5 p-3">
    <span className="text-xs uppercase tracking-wider text-gray-600">
      {label}
    </span>
    <span
      className={`font-display text-2xl font-extrabold tabular-nums ${KPI_TONE[tone]}`}
    >
      {value}
    </span>
  </Card>
);

export const KpiGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-2.5">{children}</div>
);
