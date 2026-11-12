import { levelAfter, type VisitLine } from "@vendpire/domain";
import type { MachineTile } from "../../ui.tsx";

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

type CountedLine = FaceLineLike &
  Pick<VisitLine, "productId"> & { readonly removedReason?: string | null };

/**
 * A slot on a past visit's map: every product in it, each counted → walked
 * away with; one swapped or pulled out reads "→ out". Amber when something was
 * pulled. A slot with no lines was not counted, which is no data, not a zero.
 */
export const countedTileFor = ({
  slotCode,
  lines,
  productName,
}: {
  slotCode: string;
  lines: readonly CountedLine[];
  productName: (productId: string) => string;
}): MachineTile => {
  const faceLines = buildFaceLines(lines);
  const front = faceLines[0]?.line;
  if (!front) {
    return {
      value: "—",
      tone: "pending",
      isEmpty: true,
      label: `${slotCode}: not counted on this visit`,
    };
  }
  const describe = (line: CountedLine) => {
    const removal =
      line.removed > 0 ? `, removed ${line.removed} (${line.removedReason ?? "no reason"})` : "";
    return `${productName(line.productId)}: left ${line.remaining}, added ${line.added}${removal}, walked away with ${levelAfter(line)}`;
  };
  return {
    value: `${front.remaining} → ${levelAfter(front)}`,
    tone: lines.some((line) => line.removed > 0) ? "warning" : "neutral",
    products: faceLines.map(({ line, hasLeftSlot }) => ({
      name: productName(line.productId),
      value: `${line.remaining} → ${hasLeftSlot ? "out" : levelAfter(line)}`,
      hasLeftSlot,
    })),
    label: `${slotCode}: ${lines.map(describe).join("; ")}`,
    searchText: lines.map((line) => productName(line.productId)).join(" "),
  };
};
