import { inputClass } from "../../ui.tsx";
import { formatCents } from "../../utils/money.ts";

interface ReceiptReconciliationProps {
  receiptTotal: string;
  onReceiptTotalChange: (value: string) => void;
  /** Sum of the line costs entered so far. */
  enteredCents: number;
  /** Entered minus receipt, or null when no receipt total was given. */
  variance: number | null;
}

/**
 * What we're recording against what the receipt says. The variance is the
 * point: a mistyped cost is far easier to spot as "over by $4.20" than by
 * re-reading every line.
 */
export function ReceiptReconciliation({
  receiptTotal,
  onReceiptTotalChange,
  enteredCents,
  variance,
}: ReceiptReconciliationProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-gray-50 p-3">
      <label className="text-xs text-gray-600">
        Receipt total (optional)
        <input
          className={inputClass}
          placeholder="e.g. 128.47"
          value={receiptTotal}
          onChange={(e) => onReceiptTotalChange(e.target.value)}
        />
      </label>
      <div className="pb-2 text-sm">
        <span className="text-gray-600">Entered: </span>
        <span className="font-medium text-gray-800">
          {formatCents(enteredCents)}
        </span>
      </div>
      {variance === null ? null : variance === 0 ? (
        <span className="mb-2 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          matches receipt
        </span>
      ) : (
        <span className="mb-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {variance > 0 ? "over" : "under"} by {formatCents(Math.abs(variance))}
        </span>
      )}
    </div>
  );
}
