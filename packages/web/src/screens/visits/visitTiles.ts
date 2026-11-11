import type { MachineTile } from "../../ui/MachineMap.tsx";
import { countMeterFor } from "../../ui/machineMap.ts";
import { arrivalsIn, type Restock } from "./restock.ts";
import { isSlotAnswered, productIdsAfterRestock } from "./restockSlots.ts";
import { restockTileValueFor, slotActivityFor, slotQuantityFor } from "./visitActivity.ts";
import { isSlotCounted, parseCount, rowsInSlot, type VisitRow } from "./visitRows.ts";

/** The map tiles for each step of Log Visit. Pure. */

const emptyTile = (slotCode: string): MachineTile => ({
  value: "",
  isEmpty: true,
  tone: "pending",
  label: `${slotCode} · empty slot`,
});

const COUNT_STATUS = { success: "", warning: ", low", danger: ", empty" } as const;

/** Count: the total found against the slot's combined par. */
export const countTileFor = ({
  rows,
  slotCode,
  nameOf,
}: {
  rows: readonly VisitRow[];
  slotCode: string;
  nameOf: (productId: string) => string;
}): MachineTile => {
  const slotRows = rowsInSlot(rows, slotCode);
  if (slotRows.length === 0) {
    return emptyTile(slotCode);
  }
  const names = slotRows.map((row) => nameOf(row.productId)).join(", ");
  const shared = { productCount: slotRows.length, searchText: names };
  if (!isSlotCounted(rows, slotCode)) {
    return { ...shared, value: "—", tone: "pending", label: `${slotCode} · ${names} · not counted` };
  }
  const found = slotRows.reduce((total, row) => total + (parseCount(row.left) ?? 0), 0);
  const par = slotRows.reduce((total, row) => total + (row.par ?? 0), 0);
  const { meter, tone } = countMeterFor({ found, par });
  const amount = par > 0 ? `${found} of ${par}` : `${found} found`;
  return {
    ...shared,
    value: found,
    tone,
    meter: par > 0 ? meter : undefined,
    label: `${slotCode} · ${names} · ${amount}${COUNT_STATUS[tone]}`,
  };
};

/**
 * Restock and Review: the product the slot will hold and how many. A slot
 * that ends up empty shows where its product went instead ("→B2", "Out").
 */
export const restockTileFor = ({
  rows,
  restock,
  slotCode,
  nameOf,
  needsAttention,
}: {
  rows: readonly VisitRow[];
  restock: Restock;
  slotCode: string;
  nameOf: (productId: string) => string;
  /** The submission flagged something in this slot. */
  needsAttention: boolean;
}): MachineTile => {
  const slotRows = rowsInSlot(rows, slotCode);
  if (slotRows.length === 0 && arrivalsIn(restock, slotCode).length === 0) {
    return emptyTile(slotCode);
  }
  const slot = { rows, restock, slotCode };
  const answer = restockTileValueFor(slot);
  const productIdsAfter = productIdsAfterRestock(slot);
  const [frontProductId] = productIdsAfter;
  const quantity = slotQuantityFor(slotActivityFor(slot));
  const names = [...new Set([...slotRows.map((row) => row.productId), ...productIdsAfter])]
    .map(nameOf)
    .join(", ");
  const shared = {
    productName: frontProductId === undefined ? "Empty" : nameOf(frontProductId),
    value: frontProductId === undefined ? answer : (quantity ?? "—"),
    productCount: productIdsAfter.length,
    searchText: names,
  };
  const inSlot = `${quantity ?? "—"} in slot`;

  if (needsAttention) {
    return { ...shared, tone: "warning", label: `${slotCode} · ${names} · ${inSlot} · needs a look` };
  }
  if (isSlotAnswered(slot)) {
    return {
      ...shared,
      tone: "success",
      label: `${slotCode} · ${names} · ${inSlot} · answered, ${answer}`,
    };
  }
  return { ...shared, tone: "pending", label: `${slotCode} · ${names} · ${inSlot} · not answered` };
};
