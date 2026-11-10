import { useState } from "react";
import { Button, countInputClass, hintClass } from "../../ui.tsx";
import type { ProductAction, PullReason } from "./restock.ts";
import { isCounted, leftAfterPull, parseCount, type VisitRow } from "./visitRows.ts";

const PULL_REASONS: { reason: PullReason; label: string }[] = [
  { reason: "destocked", label: "Back to the van" },
  { reason: "expired", label: "Expired" },
  { reason: "damaged", label: "Damaged" },
  { reason: "recalled", label: "Recalled" },
];

const PULL_SUMMARIES: Record<PullReason, string> = {
  destocked: "back to the van",
  expired: "expired",
  damaged: "damaged",
  recalled: "recalled",
};

const actionSummary = (action: ProductAction): string => {
  switch (action.kind) {
    case "added":
      return `✓ Added ${action.added}`;
    case "moved":
      return action.isSwap
        ? `✓ Swapped ⇄ ${action.toSlotCode}`
        : `✓ Moved → ${action.toSlotCode}`;
    case "pulled":
      return `✓ Pulled · ${PULL_SUMMARIES[action.reason]}`;
  }
};

const linkClass = "text-sm text-primary-600 hover:text-primary-500";

/** Left − pulled + Added, or null while either is half-typed. */
const nowLevelFor = (row: VisitRow, added: string): number | null => {
  const left = leftAfterPull(row);
  const parsedAdded = parseCount(added);
  if (left === null || parsedAdded === null) {
    return null;
  }
  return left + parsedAdded;
};

/**
 * One Count product in Restock: four actions until one is chosen, then the
 * chosen one's input, then a one-line summary with Change.
 */
export function RestockProductRow({
  row,
  productName,
  position,
  action,
  isPicking,
  isFirst,
  onActionChange,
  onStartPick,
  onCancelPick,
  onCountSlot,
}: {
  row: VisitRow;
  productName: string;
  position: string;
  action: ProductAction | undefined;
  /** The grid is waiting for this row's Moved / Swapped destination. */
  isPicking: boolean;
  isFirst: boolean;
  onActionChange: (action: ProductAction | null) => void;
  onStartPick: (options: { isSwap: boolean }) => void;
  onCancelPick: () => void;
  onCountSlot: () => void;
}) {
  const [isEditingAdded, setIsEditingAdded] = useState(false);
  const [isChoosingReason, setIsChoosingReason] = useState(false);

  const handleAdded = () => {
    setIsChoosingReason(false);
    setIsEditingAdded(true);
    if (action?.kind !== "added") {
      onActionChange({ kind: "added", added: "" });
    }
  };

  const handlePickStart = (options: { isSwap: boolean }) => {
    setIsChoosingReason(false);
    onStartPick(options);
  };

  const handleReason = (reason: PullReason) => {
    setIsChoosingReason(false);
    onActionChange({ kind: "pulled", reason });
  };

  const handleChange = () => {
    setIsEditingAdded(false);
    onActionChange(null);
  };

  const isAddedOpen =
    action?.kind === "added" && (isEditingAdded || action.added.trim() === "");

  return (
    <div
      className={`flex flex-col gap-2 ${isFirst ? "" : "border-t border-line pt-3"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-gray-800">
          {productName}
        </span>
        <span className="flex shrink-0 items-baseline gap-2 text-xs text-muted tabular-nums">
          {position}
          {isCounted(row) ? <span>Left {row.left}</span> : null}
        </span>
      </div>

      {!isCounted(row) ? (
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className="text-muted">Not counted</span>
          <button type="button" onClick={onCountSlot} className={linkClass}>
            Count it first →
          </button>
        </div>
      ) : isPicking ? (
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className="font-bold text-gray-800">
            Tap the slot it went to
          </span>
          <button type="button" onClick={onCancelPick} className={linkClass}>
            Cancel
          </button>
        </div>
      ) : isAddedOpen && action?.kind === "added" ? (
        <AddedInput
          added={action.added}
          nowLevel={nowLevelFor(row, action.added)}
          isFocused={isEditingAdded}
          onChange={(added) => onActionChange({ kind: "added", added })}
          onDone={() => setIsEditingAdded(false)}
          onCancel={handleChange}
        />
      ) : action ? (
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className="font-bold text-green-700 tabular-nums">
            {actionSummary(action)}
          </span>
          <button type="button" onClick={handleChange} className={linkClass}>
            Change
          </button>
        </div>
      ) : isChoosingReason ? (
        <div className="flex flex-wrap items-center gap-2">
          {PULL_REASONS.map(({ reason, label }) => (
            <Button
              key={reason}
              variant="outline"
              size="sm"
              onClick={() => handleReason(reason)}
            >
              {label}
            </Button>
          ))}
          <button
            type="button"
            onClick={() => setIsChoosingReason(false)}
            className={linkClass}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleAdded}>
            Added
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePickStart({ isSwap: false })}
          >
            Moved →
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePickStart({ isSwap: true })}
          >
            Swapped ⇄
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsChoosingReason(true)}
          >
            Pulled ▾
          </Button>
        </div>
      )}
    </div>
  );
}

/** Added for a product that stayed. Enter or leaving the field collapses it
 *  to the summary once it holds something. */
function AddedInput({
  added,
  nowLevel,
  isFocused,
  onChange,
  onDone,
  onCancel,
}: {
  added: string;
  nowLevel: number | null;
  isFocused: boolean;
  onChange: (added: string) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const handleBlur = () => {
    if (added.trim() !== "") {
      onDone();
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex w-28 flex-col gap-1">
        <span className="text-xs font-bold text-gray-800">Added</span>
        <input
          autoFocus={isFocused}
          inputMode="numeric"
          className={countInputClass}
          placeholder="0"
          value={added}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      <span className={`${hintClass} pb-2.5 tabular-nums`}>
        {nowLevel === null ? "0 if none went in" : `Now ${nowLevel}`}
      </span>
      <button type="button" onClick={onCancel} className={`${linkClass} pb-2`}>
        Cancel
      </button>
    </div>
  );
}
