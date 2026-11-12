import type { MachineTile } from "../../ui.tsx";

/** One product in a planogram slot, as a tile shows it. */
export interface PlanogramTileEntry {
  productName: string;
  /** "$1.75", or null while the slot has no price yet. */
  price: string | null;
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
  return {
    value: front.price ?? "—",
    tone: front.price ? "neutral" : "pending",
    productName: front.productName,
    productCount: entries.length,
    label: `${slotCode}: ${names.join(", ")} · ${front.price ?? "no price"}`,
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
