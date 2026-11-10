import type { LayoutChange, LayoutSlot, RemovalReason } from "@vendpire/domain";
import { formatCents } from "../../utils/money.ts";
import type { VisitSubmissionDraft } from "./visitSubmission.ts";

type MoveChange = Extract<LayoutChange, { kind: "move" }>;

/** The review's list of what changed, in plain words. Pure. */

const isOpposite = (first: MoveChange, other: LayoutChange): other is MoveChange =>
  other.kind === "move" &&
  other.fromSlotCode === first.toSlotCode &&
  other.toSlotCode === first.fromSlotCode;

const pulledPhrase = (reason: RemovalReason | null): string => {
  if (reason === "destocked") {
    return "back to the van";
  }
  return `binned, ${reason}`;
};

export const describeChanges = ({
  submission,
  planogramSlots,
  nameOf,
}: {
  submission: VisitSubmissionDraft;
  planogramSlots: readonly LayoutSlot[];
  nameOf: (productId: string) => string;
}): string[] => {
  const { layoutChanges, lines, slotsAfter } = submission;

  const priceBefore = (slotCode: string, productId?: string): number | undefined =>
    planogramSlots.find(
      (slot) =>
        slot.slotCode === slotCode && (productId === undefined || slot.productId === productId),
    )?.priceCents;

  const lineFor = (slotCode: string, productId: string) =>
    lines.find((line) => line.slotCode === slotCode && line.productId === productId);

  const describeMove = (move: MoveChange): string => {
    const base = `${move.fromSlotCode} → ${move.toSlotCode} · ${nameOf(move.productId)}`;
    const was = priceBefore(move.fromSlotCode, move.productId);
    const now = slotsAfter.find(
      (slot) => slot.slotCode === move.toSlotCode && slot.productId === move.productId,
    )?.priceCents;
    if (was === undefined || now === undefined || was === now) {
      return base;
    }
    return `${base} · now ${formatCents(now)}, was ${formatCents(was)}`;
  };

  const describeRemove = (slotCode: string, productId: string): string => {
    const base = `${slotCode} · ${nameOf(productId)}`;
    const line = lineFor(slotCode, productId);
    if (line === undefined || line.removed === 0) {
      return `${base} out (sold out)`;
    }
    return `${base} ${pulledPhrase(line.removedReason)} (${line.removed})`;
  };

  const descriptions: string[] = [];
  const swappedPartners = new Set<LayoutChange>();

  for (const change of layoutChanges) {
    if (swappedPartners.has(change)) {
      continue;
    }
    switch (change.kind) {
      case "move": {
        const partner = layoutChanges.find(
          (other) => other !== change && !swappedPartners.has(other) && isOpposite(change, other),
        ) as MoveChange | undefined;
        if (partner === undefined) {
          descriptions.push(describeMove(change));
          break;
        }
        swappedPartners.add(partner);
        descriptions.push(
          `${change.fromSlotCode} ⇄ ${change.toSlotCode} · ${nameOf(change.productId)}, ${nameOf(partner.productId)}`,
        );
        break;
      }
      case "remove":
        descriptions.push(describeRemove(change.slotCode, change.productId));
        break;
      case "add": {
        const added = lineFor(change.slotCode, change.productId)?.added ?? 0;
        descriptions.push(`${change.slotCode} · ${nameOf(change.productId)} in · ${added}`);
        break;
      }
      case "set-price": {
        const before = priceBefore(change.slotCode);
        if (before !== undefined && before !== change.priceCents) {
          descriptions.push(
            `${change.slotCode} · ${formatCents(before)} → ${formatCents(change.priceCents)}`,
          );
        }
        break;
      }
    }
  }
  return descriptions;
};
