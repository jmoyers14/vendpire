import type { CSSProperties, ReactNode } from "react";
import { focusRing } from "./focus.ts";

export type StepStatus = "done" | "current" | "upcoming";

export interface Step<Id extends string> {
  id: Id;
  label: string;
  /** The progress line under the label, e.g. "12 of 37 counted". */
  detail: ReactNode;
  status: StepStatus;
}

const NUMBER_TONE: Record<StepStatus, string> = {
  done: "bg-success-soft text-success",
  current: "bg-action text-on-action",
  upcoming: "bg-divider text-muted-strong",
};

/**
 * Numbered steps for a sequential flow. Steps are buttons when `onSelect` is
 * given, so you can jump back to an earlier one.
 */
export const Stepper = <Id extends string>({
  label,
  steps,
  onSelect,
}: {
  /** Accessible name for the step list, e.g. "Visit steps". */
  label: string;
  steps: Step<Id>[];
  onSelect?: (id: Id) => void;
}) => (
  <ol
    aria-label={label}
    style={{ "--step-count": steps.length } as CSSProperties}
    className="grid gap-3 sm:grid-cols-[repeat(var(--step-count),minmax(0,1fr))]"
  >
    {steps.map((step, index) => {
      const isCurrent = step.status === "current";
      const body = (
        <>
          <span
            className={`flex size-8 flex-none items-center justify-center rounded-full text-label ${NUMBER_TONE[step.status]}`}
          >
            {index + 1}
          </span>
          <span className="flex flex-col">
            <span className="text-body leading-5 font-bold text-ink">
              {step.label}
            </span>
            <span className="text-body-sm text-muted-strong tabular-nums">
              {step.detail}
            </span>
          </span>
        </>
      );
      const box = `flex min-h-16 w-full items-center gap-3 rounded-panel border bg-card px-4 py-3 text-left ${
        isCurrent ? "border-action ring-1 ring-action ring-inset" : "border-line"
      }`;
      return (
        <li key={step.id}>
          {onSelect ? (
            <button
              type="button"
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => onSelect(step.id)}
              className={`${box} ${isCurrent ? "" : "hover:border-field"} ${focusRing}`}
            >
              {body}
            </button>
          ) : (
            <div aria-current={isCurrent ? "step" : undefined} className={box}>
              {body}
            </div>
          )}
        </li>
      );
    })}
  </ol>
);
