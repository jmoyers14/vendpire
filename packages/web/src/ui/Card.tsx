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
  <h2 className={`font-display text-lg font-extrabold text-ink ${className}`}>
    {children}
  </h2>
);

export type KpiTone = "neutral" | "profit" | "loss";

const KPI_TONE: Record<KpiTone, string> = {
  neutral: "text-ink",
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
  <Card className="grid content-start gap-1 border border-line p-5">
    <span className="text-overline text-muted-strong uppercase">{label}</span>
    <span className={`font-display text-stat tabular-nums ${KPI_TONE[tone]}`}>{value}</span>
  </Card>
);

export const KpiGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>
);
