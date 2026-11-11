import type { ReactNode } from "react";
import type { StatusTone } from "./tone.ts";

/**
 * A tinted key/value list for derived numbers that update as you type: label
 * left, mono value right, an optional verdict row last.
 */
export const FactsPanel = ({ children }: { children: ReactNode }) => (
  <dl className="divide-y divide-divider overflow-hidden rounded-panel border border-divider bg-app">
    {children}
  </dl>
);

export type FactTone = "neutral" | "success" | "danger";

const VALUE_TONE: Record<FactTone, string> = {
  neutral: "text-ink",
  success: "font-bold text-success",
  danger: "font-bold text-danger",
};

export const Fact = ({
  label,
  detail,
  value,
  tone = "neutral",
}: {
  label: ReactNode;
  /** A second line under the label, e.g. "Previous Owner · Oct 29, 2026". */
  detail?: ReactNode;
  value: ReactNode;
  tone?: FactTone;
}) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3">
    <dt className="text-body text-muted-strong">
      {label}
      {detail ? <span className="block text-body-sm">{detail}</span> : null}
    </dt>
    <dd
      className={`text-right font-mono text-mono tabular-nums ${VALUE_TONE[tone]}`}
    >
      {value}
    </dd>
  </div>
);

export type VerdictTone = Exclude<StatusTone, "danger"> | "neutral";

const VERDICT_TONE: Record<VerdictTone, string> = {
  success: "bg-success-soft font-bold text-success",
  warning: "bg-warning-soft font-bold text-warning",
  neutral: "text-muted-strong",
};

/** The conclusion the facts add up to, e.g. "Matches the receipt". */
export const FactVerdict = ({
  tone,
  children,
}: {
  tone: VerdictTone;
  children: ReactNode;
}) => (
  <div
    role="status"
    className={`flex items-center gap-2 px-4 py-3 text-body ${VERDICT_TONE[tone]}`}
  >
    {children}
  </div>
);
