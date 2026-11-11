import { type RemovalReason, slotProductKey } from "@vendpire/domain";
import { type Arrival, arrivalsIn, type Restock } from "./restock.ts";
import { hasRestockQuestions, isSlotAnswered, nowLevelFor } from "./restockSlots.ts";
import { isCounted, parseCount, rowsInSlot, type VisitRow } from "./visitRows.ts";

/**
 * What happened to each product this visit, as the map tiles, the slot
 * summaries and the review table show it. Pure, and display-only: what gets
 * saved is still `buildVisitSubmission`.
 */

/** Reason wording for notes; chips capitalise the first letter. */
export const REMOVAL_LABELS: Record<RemovalReason, string> = {
  destocked: "back to the van",
  expired: "expired",
  damaged: "damaged",
  recalled: "recalled",
  transferred: "transferred",
};

/** What became of a product this visit. */
type ActivityOutcome =
  | "uncounted"
  | "unanswered"
  | "stayed"
  | "moved"
  | "taken-out"
  | "arrived";

export interface ProductActivity {
  outcome: ActivityOutcome;
  slotCode: string;
  productId: string;
  /** The slot price at form open, for estimating revenue. */
  priceCents: number;
  par: number | null;
  /** Null when not counted, or for a product arriving this visit. */
  found: number | null;
  /** Null without a count or a previous visit to compare against. */
  sold: number | null;
  /** Null until answered. */
  added: number | null;
  pulled: number;
  /** Null until the numbers it needs are in. */
  now: number | null;
  /** Units pulled while the product stays in the slot. */
  partialPull: { count: number; reason: RemovalReason } | null;
  /** For display: what happened, in words. */
  notes: string[];
}

const partialPullOf = (row: VisitRow): ProductActivity["partialPull"] => {
  const count = parseCount(row.removed);
  if (count === null || count === 0 || row.removedReason === null) {
    return null;
  }
  return { count, reason: row.removedReason };
};

const partialPullNote = ({ count, reason }: { count: number; reason: RemovalReason }) =>
  `Pulled ${count} · ${REMOVAL_LABELS[reason]}`;

const rowActivity = (row: VisitRow, restock: Restock): ProductActivity => {
  const empty = {
    slotCode: row.slotCode,
    productId: row.productId,
    priceCents: row.priceCents,
    par: row.par,
    found: null,
    sold: null,
    added: null,
    pulled: 0,
    now: null,
    partialPull: null,
    notes: [],
  };
  const found = isCounted(row) ? parseCount(row.left) : null;
  if (found === null) {
    return { ...empty, outcome: "uncounted", notes: ["Not counted"] };
  }

  const partialPull = partialPullOf(row);
  const counted = {
    ...empty,
    found,
    sold: row.previousLevel === null ? null : Math.max(0, row.previousLevel - found),
    partialPull,
    pulled: partialPull?.count ?? 0,
    notes: partialPull ? [partialPullNote(partialPull)] : [],
  };
  const action = restock.actions[slotProductKey(row)];

  if (action === undefined) {
    return { ...counted, outcome: "unanswered", notes: [...counted.notes, "No restock answer"] };
  }
  if (action.kind === "added") {
    return {
      ...counted,
      outcome: "stayed",
      added: parseCount(action.added),
      now: nowLevelFor(row, action.added),
    };
  }
  // A product that left isn't partially pulled: everything found went with it.
  const leaving = { ...counted, partialPull: null, added: 0, now: 0 };
  if (action.kind === "moved") {
    return {
      ...leaving,
      outcome: "moved",
      pulled: 0,
      notes: [`${action.isSwap ? "Swapped with" : "Moved to"} ${action.toSlotCode}`],
    };
  }
  return {
    ...leaving,
    outcome: "taken-out",
    pulled: found,
    notes: [`Taken out · ${REMOVAL_LABELS[action.reason]}`],
  };
};

const arrivalActivity = (
  arrival: Arrival,
  { priceCents }: { priceCents: number },
): ProductActivity => {
  const added = parseCount(arrival.added);
  return {
    outcome: "arrived",
    slotCode: arrival.slotCode,
    productId: arrival.productId,
    priceCents,
    par: null,
    found: null,
    sold: null,
    added,
    pulled: 0,
    now: added,
    partialPull: null,
    notes: [
      arrival.fromSlotCode === null ? "New in this slot" : `From ${arrival.fromSlotCode}`,
    ],
  };
};

/** One slot's products, front to back, then what arrived in it. */
export const slotActivityFor = ({
  rows,
  restock,
  slotCode,
}: {
  rows: readonly VisitRow[];
  restock: Restock;
  slotCode: string;
}): ProductActivity[] => {
  const slotRows = rowsInSlot(rows, slotCode);
  const priceCents = slotRows[0]?.priceCents ?? 0;
  return [
    ...slotRows.map((row) => rowActivity(row, restock)),
    ...arrivalsIn(restock, slotCode).map((arrival) => arrivalActivity(arrival, { priceCents })),
  ];
};

/** Every slot in walking order. */
export const visitActivityFor = ({
  rows,
  restock,
  slotCodes,
}: {
  rows: readonly VisitRow[];
  restock: Restock;
  slotCodes: readonly string[];
}): ProductActivity[] =>
  slotCodes.flatMap((slotCode) => slotActivityFor({ rows, restock, slotCode }));

/**
 * Whether a product belongs in the review's "slots with activity" table. An
 * uncounted product is left out: the review's own warning covers those.
 */
export const hasActivity = (activity: ProductActivity): boolean => {
  if (activity.outcome === "uncounted") {
    return false;
  }
  return (
    (activity.sold ?? 0) > 0 ||
    (activity.added ?? 0) > 0 ||
    activity.pulled > 0 ||
    activity.notes.length > 0
  );
};

export interface VisitTotals {
  /** Null when nothing could be compared with a previous visit. */
  soldCount: number | null;
  revenueCents: number;
  addedCount: number;
  pulledCount: number;
}

export const visitTotalsFor = (activities: readonly ProductActivity[]): VisitTotals => {
  let soldCount: number | null = null;
  let revenueCents = 0;
  let addedCount = 0;
  let pulledCount = 0;
  for (const activity of activities) {
    if (activity.sold !== null) {
      soldCount = (soldCount ?? 0) + activity.sold;
      revenueCents += activity.sold * activity.priceCents;
    }
    addedCount += activity.added ?? 0;
    pulledCount += activity.pulled;
  }
  return { soldCount, revenueCents, addedCount, pulledCount };
};

const quantityAfter = (activity: ProductActivity): number | null => {
  switch (activity.outcome) {
    case "stayed":
    case "arrived":
      return activity.now;
    case "unanswered":
      // Until it's answered, what's left after any pull stands in.
      return activity.found === null ? null : Math.max(0, activity.found - activity.pulled);
    default:
      return null;
  }
};

/**
 * Units in the slot once Restock is done, counting only the products that
 * stay or arrive. Null while none of them has a number yet.
 */
export const slotQuantityFor = (activities: readonly ProductActivity[]): number | null =>
  activities.reduce<number | null>((total, activity) => {
    const quantity = quantityAfter(activity);
    return quantity === null ? total : (total ?? 0) + quantity;
  }, null);

/** "+3", "−2", or "✓" for no net change. */
export const signedChange = (count: number): string => {
  if (count > 0) {
    return `+${count}`;
  }
  if (count < 0) {
    return `−${Math.abs(count)}`;
  }
  return "✓";
};

/**
 * A Restock tile's one-word answer: "→B2", "⇄C4", "New", "Out", "+3", "−2",
 * "✓", or "—" while the slot still has questions. "" for an empty slot.
 */
export const restockTileValueFor = ({
  rows,
  restock,
  slotCode,
}: {
  rows: readonly VisitRow[];
  restock: Restock;
  slotCode: string;
}): string => {
  const slot = { rows, restock, slotCode };
  const slotRows = rowsInSlot(rows, slotCode);
  const arrivals = arrivalsIn(restock, slotCode);
  if (slotRows.length === 0 && arrivals.length === 0) {
    return "";
  }
  if (!hasRestockQuestions(slot) || !isSlotAnswered(slot)) {
    return "—";
  }

  const actions = slotRows.map((row) => restock.actions[slotProductKey(row)]);
  const move = actions.find((action) => action?.kind === "moved");
  if (move?.kind === "moved") {
    return `${move.isSwap ? "⇄" : "→"}${move.toSlotCode}`;
  }
  if (arrivals.some((arrival) => arrival.fromSlotCode === null)) {
    return "New";
  }
  if (actions.some((action) => action?.kind === "pulled")) {
    return "Out";
  }
  const net = slotActivityFor(slot).reduce(
    (total, activity) => total + (activity.added ?? 0) - activity.pulled,
    0,
  );
  return signedChange(net);
};

const addedText = (added: number | null): string | null => {
  if (added === null) {
    return null;
  }
  return added > 0 ? `Added ${added}` : "Nothing added";
};

const describeActivity = (activity: ProductActivity): string | null => {
  const pullNote = activity.partialPull ? partialPullNote(activity.partialPull) : null;
  switch (activity.outcome) {
    case "uncounted":
      return null;
    case "unanswered":
      // A pull logged before the product's answer still shows.
      return pullNote;
    case "stayed":
      return [pullNote, addedText(activity.added)].filter(Boolean).join(", ");
    case "moved":
    case "taken-out":
      return activity.notes[0] ?? null;
    case "arrived":
      return [activity.notes[0], addedText(activity.added)].filter(Boolean).join(", ");
  }
};

/**
 * The answers recorded in one slot, in words, for the summary row with Undo.
 * Products are named only when the slot holds more than one.
 */
export const describeSlotAnswers = ({
  rows,
  restock,
  slotCode,
  nameOf,
}: {
  rows: readonly VisitRow[];
  restock: Restock;
  slotCode: string;
  nameOf: (productId: string) => string;
}): string[] => {
  const activities = slotActivityFor({ rows, restock, slotCode });
  const isNamed = activities.length > 1;
  return activities.flatMap((activity) => {
    const text = describeActivity(activity);
    if (text === null) {
      return [];
    }
    return [isNamed ? `${nameOf(activity.productId)}: ${text}` : text];
  });
};
