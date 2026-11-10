import type { LayoutSlot } from "@vendpire/domain";
import { parseCount, type VisitRow } from "./visitRows.ts";
import type { VisitSubmissionDraft } from "./visitSubmission.ts";

/**
 * The review's before and after machine faces, as data. Pure. The after face
 * reads the same submission Save sends, so what the operator checks against
 * the photo is what gets saved.
 */

export interface ReviewProduct {
  productId: string;
  priceCents: number;
  /** Null while unknown: a blank Left before, or a slot with no line after. */
  units: number | null;
  /** Set when the same product sat in this slot at another price. */
  wasPriceCents: number | null;
}

export interface ReviewCell {
  slotCode: string;
  /** Front to back. */
  products: ReviewProduct[];
  /** Products that left this slot, shown struck through on a changed cell. */
  removedProducts: { productId: string; priceCents: number }[];
  isChanged: boolean;
}

export type ReviewFace = ReadonlyMap<string, ReviewCell>;

const groupBySlot = (slots: readonly LayoutSlot[]): Map<string, LayoutSlot[]> => {
  const grouped = new Map<string, LayoutSlot[]>();
  for (const slot of slots) {
    grouped.set(slot.slotCode, [...(grouped.get(slot.slotCode) ?? []), slot]);
  }
  return grouped;
};

export const buildBeforeFace = ({
  planogramSlots,
  rows,
}: {
  planogramSlots: readonly LayoutSlot[];
  rows: readonly Pick<VisitRow, "slotCode" | "productId" | "left">[];
}): ReviewFace => {
  const face = new Map<string, ReviewCell>();
  for (const [slotCode, slots] of groupBySlot(planogramSlots)) {
    const products = slots.map(({ productId, priceCents }) => {
      const row = rows.find(
        (candidate) => candidate.slotCode === slotCode && candidate.productId === productId,
      );
      return {
        productId,
        priceCents,
        units: row ? parseCount(row.left) : null,
        wasPriceCents: null,
      };
    });
    face.set(slotCode, { slotCode, products, removedProducts: [], isChanged: false });
  }
  return face;
};

export const buildAfterFace = ({
  planogramSlots,
  submission,
}: {
  planogramSlots: readonly LayoutSlot[];
  submission: VisitSubmissionDraft;
}): ReviewFace => {
  const { lines, slotsAfter } = submission;
  const beforeBySlot = groupBySlot(planogramSlots);
  const afterBySlot = groupBySlot(slotsAfter);
  const slotCodes = new Set([...beforeBySlot.keys(), ...afterBySlot.keys()]);

  const face = new Map<string, ReviewCell>();
  for (const slotCode of slotCodes) {
    const before = beforeBySlot.get(slotCode) ?? [];
    const after = afterBySlot.get(slotCode) ?? [];

    const products = after.map(({ productId, priceCents }) => {
      const line = lines.find(
        (candidate) => candidate.slotCode === slotCode && candidate.productId === productId,
      );
      const priceBefore = before.find((slot) => slot.productId === productId)?.priceCents;
      return {
        productId,
        priceCents,
        units: line ? line.remaining - line.removed + line.added : null,
        wasPriceCents:
          priceBefore !== undefined && priceBefore !== priceCents ? priceBefore : null,
      };
    });
    const removedProducts = before
      .filter((slot) => !after.some((kept) => kept.productId === slot.productId))
      .map(({ productId, priceCents }) => ({ productId, priceCents }));
    const isNewProduct = after.some(
      (slot) => !before.some((was) => was.productId === slot.productId),
    );
    const isChanged =
      removedProducts.length > 0 ||
      isNewProduct ||
      products.some((product) => product.wasPriceCents !== null);

    face.set(slotCode, { slotCode, products, removedProducts, isChanged });
  }
  return face;
};
