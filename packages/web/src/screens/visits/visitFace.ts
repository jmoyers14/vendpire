import { levelAfter, type VisitLine } from "@vendpire/domain";

type FaceLineLike = Pick<VisitLine, "remaining" | "removed" | "added">;

export interface FaceLine<Line extends FaceLineLike> {
  readonly line: Line;
  /** Walked away with nothing while another product in the slot has stock. */
  readonly hasLeftSlot: boolean;
}

/**
 * A slot's lines as its face shows them. A move, swap or pull keeps the
 * outgoing product's line for the sales figures, so it is marked out and drawn
 * last rather than read as stock behind the new product. Inferred from counts,
 * so a product that sold out behind another one reads as out too.
 */
export const buildFaceLines = <Line extends FaceLineLike>(
  lines: readonly Line[],
): FaceLine<Line>[] => {
  const isSlotStocked = lines.some((line) => levelAfter(line) > 0);
  return lines
    .map((line) => ({
      line,
      hasLeftSlot: isSlotStocked && levelAfter(line) === 0 && line.added === 0,
    }))
    .sort((a, b) => Number(a.hasLeftSlot) - Number(b.hasLeftSlot));
};
