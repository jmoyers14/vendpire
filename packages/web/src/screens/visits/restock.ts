import { type SlotProduct, slotProductKey } from "@vendpire/domain";
import { centsToInput } from "../../utils/money.ts";
import { isCounted, type VisitRow } from "./visitRows.ts";

/**
 * The Restock step's state: what the operator did to each counted product,
 * which products arrived where, and each slot's price.
 *
 * Entirely pure, so every `restockWith*` returns a new value and never touches
 * its input. The conversion to visit lines lives elsewhere.
 */

export type PullReason = "destocked" | "expired" | "damaged" | "recalled";

export type ProductAction =
  | { kind: "added"; added: string }
  | {
      kind: "moved";
      toSlotCode: string;
      isSwap: boolean;
      /** On a swap, the product that moved the other way, so the partner is
       *  found exactly even in a mixed slot. */
      withProductId?: string;
    }
  | { kind: "pulled"; reason: PullReason };

/** A product that lands in a slot this visit, waiting for its Added. */
export interface Arrival {
  slotCode: string;
  productId: string;
  /** Null means new stock; the app never links a source on its own. */
  fromSlotCode: string | null;
  added: string;
  bestBy: string;
  tracksExpiration: boolean;
}

export interface Restock {
  /** Keyed by `slotProductKey` of a Count row. */
  actions: Record<string, ProductAction>;
  /** Walking order, back of the slot last. */
  arrivals: Arrival[];
  /** Slot code to dollars text, because these back inputs. */
  prices: Record<string, string>;
}

const isSameProduct = (a: SlotProduct, b: SlotProduct): boolean =>
  a.slotCode === b.slotCode && a.productId === b.productId;

const actionOf = (restock: Restock, key: SlotProduct): ProductAction | undefined =>
  restock.actions[slotProductKey(key)];

const withoutAction = (
  actions: Restock["actions"],
  key: SlotProduct,
): Restock["actions"] => {
  const { [slotProductKey(key)]: _removed, ...rest } = actions;
  return rest;
};

/** The arrival a move from `source` created, if any. */
const isArrivalFrom = (arrival: Arrival, source: VisitRow, toSlotCode: string) =>
  arrival.slotCode === toSlotCode &&
  arrival.productId === source.productId &&
  arrival.fromSlotCode === source.slotCode;

/**
 * Pre-fills an empty price from the source slot so a product moved into an
 * empty-before slot doesn't arrive unpriced.
 */
const pricesWithFallback = (
  prices: Restock["prices"],
  { toSlotCode, fromSlotCode }: { toSlotCode: string; fromSlotCode: string },
): Restock["prices"] => {
  if ((prices[toSlotCode] ?? "") !== "") {
    return prices;
  }
  return { ...prices, [toSlotCode]: prices[fromSlotCode] ?? "" };
};

/** Removes `row`'s action and the arrival it created, without touching a swap
 *  partner. */
const withoutRowAction = (restock: Restock, row: VisitRow): Restock => {
  const previous = actionOf(restock, row);
  const actions = withoutAction(restock.actions, row);
  if (previous?.kind !== "moved") {
    return { ...restock, actions };
  }
  return {
    ...restock,
    actions,
    arrivals: restock.arrivals.filter(
      (arrival) => !isArrivalFrom(arrival, row, previous.toSlotCode),
    ),
  };
};

/** The row that was swapped with `row`. Null when `row` isn't half of a
 *  swap. */
const swapPartnerKey = (restock: Restock, row: VisitRow): SlotProduct | null => {
  const previous = actionOf(restock, row);
  if (
    previous?.kind !== "moved" ||
    !previous.isSwap ||
    previous.withProductId === undefined
  ) {
    return null;
  }
  return { slotCode: previous.toSlotCode, productId: previous.withProductId };
};

const withMove = (
  restock: Restock,
  row: VisitRow,
  action: Extract<ProductAction, { kind: "moved" }>,
): Restock => {
  const arrival: Arrival = {
    slotCode: action.toSlotCode,
    productId: row.productId,
    fromSlotCode: row.slotCode,
    added: "",
    bestBy: row.bestBy,
    tracksExpiration: row.tracksExpiration,
  };
  return {
    actions: { ...restock.actions, [slotProductKey(row)]: action },
    arrivals: [...restock.arrivals, arrival],
    prices: pricesWithFallback(restock.prices, {
      toSlotCode: action.toSlotCode,
      fromSlotCode: row.slotCode,
    }),
  };
};

/**
 * Nothing done yet, with a price for every machine slot taken from its Count
 * rows (they share one). A slot with no rows gets `""`.
 */
export const buildRestock = ({
  shelves,
  rows,
}: {
  shelves: readonly string[][];
  rows: readonly VisitRow[];
}): Restock => {
  const prices: Restock["prices"] = {};
  for (const slotCode of shelves.flat()) {
    const first = rows.find((row) => row.slotCode === slotCode);
    prices[slotCode] = first ? centsToInput(first.priceCents) : "";
  }
  return { actions: {}, arrivals: [], prices };
};

/**
 * Sets the row's action; null clears it. Whatever the previous action created
 * goes with it: a move's arrival, and for a swap the partner's action and
 * arrival too.
 */
export const restockWithAction = (
  restock: Restock,
  row: VisitRow,
  action: ProductAction | null,
): Restock => {
  const partnerKey = swapPartnerKey(restock, row);
  let cleared = withoutRowAction(restock, row);
  if (partnerKey) {
    const partner = { ...row, ...partnerKey };
    cleared = withoutRowAction(cleared, partner);
  }
  if (action === null) {
    return cleared;
  }
  if (action.kind === "moved") {
    return withMove(cleared, row, action);
  }
  return {
    ...cleared,
    actions: { ...cleared.actions, [slotProductKey(row)]: action },
  };
};

/** Both products move into each other's slot. The caller has already picked
 *  `b`; when its slot is mixed only that product moves. */
export const restockWithSwap = (
  restock: Restock,
  { a, b }: { a: VisitRow; b: VisitRow },
): Restock => {
  const clearedA = restockWithAction(restock, a, null);
  const cleared = restockWithAction(clearedA, b, null);
  const movedA = withMove(cleared, a, {
    kind: "moved",
    toSlotCode: b.slotCode,
    isSwap: true,
    withProductId: b.productId,
  });
  return withMove(movedA, b, {
    kind: "moved",
    toSlotCode: a.slotCode,
    isSwap: true,
    withProductId: a.productId,
  });
};

/** A product put into a slot that didn't come from anywhere this visit. */
export const restockWithNewStock = (
  restock: Restock,
  arrival: Omit<Arrival, "fromSlotCode" | "added" | "bestBy">,
): Restock => ({
  ...restock,
  arrivals: [
    ...restock.arrivals,
    { ...arrival, fromSlotCode: null, added: "", bestBy: "" },
  ],
});

export const restockWithArrivalChange = (
  restock: Restock,
  key: SlotProduct,
  patch: Partial<Pick<Arrival, "added" | "bestBy">>,
): Restock => ({
  ...restock,
  arrivals: restock.arrivals.map((arrival) =>
    isSameProduct(arrival, key) ? { ...arrival, ...patch } : arrival,
  ),
});

export const restockWithPrice = (
  restock: Restock,
  slotCode: string,
  price: string,
): Restock => ({
  ...restock,
  prices: { ...restock.prices, [slotCode]: price },
});

/** Every counted product without an action stays: Added 0. Uncounted rows are
 *  left alone, since nothing was recorded for them. */
export const restockWithRestUnchanged = (
  restock: Restock,
  rows: readonly VisitRow[],
): Restock => {
  const actions = { ...restock.actions };
  for (const row of rows) {
    const key = slotProductKey(row);
    if (isCounted(row) && actions[key] === undefined) {
      actions[key] = { kind: "added", added: "0" };
    }
  }
  return { ...restock, actions };
};

/**
 * The operator said the arrival came from `source`: the source becomes a move
 * to the arrival's slot, and the arrival keeps its Added and best-by. Whatever
 * the arrival was linked to before is released.
 */
export const restockWithSourceLinked = (
  restock: Restock,
  { arrival, source }: { arrival: Arrival; source: VisitRow },
): Restock => {
  const sourceAction = actionOf(restock, source);
  const isAlreadyLinked =
    sourceAction?.kind === "moved" &&
    sourceAction.toSlotCode === arrival.slotCode &&
    arrival.fromSlotCode === source.slotCode;
  if (isAlreadyLinked) {
    return restock;
  }

  const arrivalIndex = restock.arrivals.findIndex((candidate) =>
    isSameProduct(candidate, arrival),
  );
  // Clearing a source removes the arrival it created, so the arrival is taken
  // out here and put back afterwards.
  let cleared = restock;
  if (arrival.fromSlotCode !== null) {
    const previousSource = {
      ...source,
      slotCode: arrival.fromSlotCode,
      productId: arrival.productId,
    };
    cleared = restockWithAction(cleared, previousSource, null);
  }
  cleared = restockWithAction(cleared, source, null);

  const others = cleared.arrivals.filter(
    (candidate) => !isSameProduct(candidate, arrival),
  );
  const linked: Arrival = { ...arrival, fromSlotCode: source.slotCode };
  const index = arrivalIndex < 0 ? others.length : Math.min(arrivalIndex, others.length);
  return {
    actions: {
      ...cleared.actions,
      [slotProductKey(source)]: {
        kind: "moved",
        toSlotCode: arrival.slotCode,
        isSwap: false,
      },
    },
    arrivals: [...others.slice(0, index), linked, ...others.slice(index)],
    prices: pricesWithFallback(cleared.prices, {
      toSlotCode: arrival.slotCode,
      fromSlotCode: source.slotCode,
    }),
  };
};

/**
 * Counted rows that could be where this arrival came from: the same product,
 * in another slot, pulled back to the van. Only ever offered, never applied.
 */
export const suggestedSourcesFor = (
  restock: Restock,
  rows: readonly VisitRow[],
  arrival: Arrival,
): VisitRow[] =>
  rows.filter((row) => {
    const action = actionOf(restock, row);
    return (
      isCounted(row) &&
      row.productId === arrival.productId &&
      row.slotCode !== arrival.slotCode &&
      action?.kind === "pulled" &&
      action.reason === "destocked"
    );
  });

export const arrivalsIn = (restock: Restock, slotCode: string): Arrival[] =>
  restock.arrivals.filter((arrival) => arrival.slotCode === slotCode);
