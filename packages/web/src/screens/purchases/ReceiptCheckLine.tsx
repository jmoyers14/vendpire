import { formatCents } from "../../utils/money.ts";
import { differenceLabelFor, type ReceiptCheck } from "./rows.ts";

/**
 * The items total against the receipt, under the items table. Nothing until a
 * receipt total is entered.
 */
export function ReceiptCheckLine({ check }: { check: ReceiptCheck }) {
  if (check.status === "none") {
    return null;
  }
  if (check.status === "matches") {
    return (
      <p role="status" className="rounded-control bg-success-soft px-4 py-3 text-button text-success">
        ✓ Matches the {formatCents(check.receiptCents)} receipt
      </p>
    );
  }
  return (
    <p role="status" className="rounded-control bg-warning-soft px-4 py-3 text-button text-warning">
      Items are {differenceLabelFor(check)} the {formatCents(check.receiptCents)} receipt
    </p>
  );
}
