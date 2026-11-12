import type { ApiPurchase } from "../../apiTypes.ts";

type PurchaseLike = Pick<ApiPurchase, "receiptTotalCents"> & {
  lines: readonly { totalCostCents: number }[];
};

/** What the purchase's lines add up to. */
export const linesTotalFor = (purchase: Pick<PurchaseLike, "lines">): number =>
  purchase.lines.reduce((sum, line) => sum + line.totalCostCents, 0);

/** The lines don't add up to the receipt total you typed in. */
export const isReceiptMismatch = (purchase: PurchaseLike): boolean =>
  purchase.receiptTotalCents !== null && purchase.receiptTotalCents !== linesTotalFor(purchase);

/** Every listed purchase's lines, summed. */
export const spentCentsFor = (purchases: readonly Pick<PurchaseLike, "lines">[]): number =>
  purchases.reduce((sum, purchase) => sum + linesTotalFor(purchase), 0);
