import type { ApiPurchase } from "../../apiTypes.ts";

type PurchaseLike = Pick<ApiPurchase, "receiptTotalCents"> & {
  lines: readonly { totalCostCents: number }[];
};

export const linesTotalCentsFor = (purchase: Pick<PurchaseLike, "lines">): number =>
  purchase.lines.reduce((sum, line) => sum + line.totalCostCents, 0);

/** You typed a receipt total, and the lines don't add up to it. */
export const isReceiptMismatch = <Purchase extends PurchaseLike>(
  purchase: Purchase,
): purchase is Purchase & { receiptTotalCents: number } =>
  purchase.receiptTotalCents !== null &&
  purchase.receiptTotalCents !== linesTotalCentsFor(purchase);

export const spentCentsFor = (purchases: readonly Pick<PurchaseLike, "lines">[]): number =>
  purchases.reduce((sum, purchase) => sum + linesTotalCentsFor(purchase), 0);
