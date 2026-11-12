import type { MachineTile } from "../../ui.tsx";
import { formatCents } from "../../utils/money.ts";
import { plural } from "../../utils/text.ts";

/** One product in a planogram slot, as a tile shows it. */
export interface PlanogramTileEntry {
  productName: string;
  /** Null while the slot has no valid price yet. */
  priceCents: number | null;
}

/**
 * A planogram slot on the map: the front product over the slot's price, ×N
 * when products share it. An empty slot reads as empty, not as a missing price.
 */
export const planogramTileFor = ({
  slotCode,
  entries,
}: {
  slotCode: string;
  /** Front to back. */
  entries: PlanogramTileEntry[];
}): MachineTile => {
  const [front] = entries;
  if (!front) {
    return { value: "—", tone: "pending", isEmpty: true, label: `${slotCode}: empty` };
  }
  const names = entries.map((entry) => entry.productName);
  const price = front.priceCents === null ? null : formatCents(front.priceCents);
  return {
    value: price ?? "—",
    tone: price ? "neutral" : "pending",
    productName: front.productName,
    productCount: entries.length,
    label: `${slotCode}: ${names.join(", ")} · ${price ?? "no price"}`,
    searchText: names.join(" "),
  };
};

/** "Front" and "Behind" in a shared slot; nothing for a slot with one product. */
export const slotPositionLabel = ({ index, count }: { index: number; count: number }): string => {
  if (count === 1) {
    return "";
  }
  return index === 0 ? "Front" : "Behind";
};

/** "34 of 45 slots assigned". A shared slot counts once. */
export const assignedSummaryFor = ({
  assignedSlots,
  slotCount,
}: {
  assignedSlots: { slotCode: string }[];
  slotCount: number;
}): string => {
  const assignedCount = new Set(assignedSlots.map((slot) => slot.slotCode)).size;
  return `${assignedCount} of ${plural(slotCount, { one: "slot", many: "slots" })} assigned`;
};
