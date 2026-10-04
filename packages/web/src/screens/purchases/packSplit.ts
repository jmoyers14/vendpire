import { allocateProportionally } from "@vendpire/domain";
import { parseDollarsToCents } from "../../utils/money.ts";

/** One product's share of a pack line's cost. */
export interface SplitPart {
  productId: string;
  units: number;
  cents: number;
}

interface SplittablePack {
  contents: { productId: string; units: number }[];
}

/**
 * How a pack row's cost will be split across its contents, for display while
 * the operator types. Uses the same domain allocator the server uses, so the
 * numbers previewed are the numbers stored — but the server's expansion stays
 * authoritative.
 *
 * Returns null while the row is still incomplete: a half-typed cost shouldn't
 * flash a wrong split.
 */
export const previewPackSplit = (
  pack: SplittablePack | undefined,
  qty: string,
  totalCost: string,
): SplitPart[] | null => {
  const packQty = Number.parseInt(qty, 10);
  const costCents = parseDollarsToCents(totalCost);
  if (!pack || Number.isNaN(packQty) || packQty < 1 || costCents === null) {
    return null;
  }
  const weights = pack.contents.map((content) => content.units * packQty);
  const costs = allocateProportionally(costCents, weights);
  return pack.contents.map((content, index) => ({
    productId: content.productId,
    units: content.units * packQty,
    cents: costs[index] ?? 0,
  }));
};
