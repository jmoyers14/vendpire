import {
  calendarDateAfter,
  calendarDaysUntil,
  levelAfter,
  type RemovalReason,
  slotProductKey,
  type VisitLine,
} from "@vendpire/domain";

/**
 * The Count step's state: what was in each slot on arrival.
 *
 * Pure, so these rules are tested without a browser. What gets sent is built
 * from these rows and the Restock in `visitSubmission.ts`.
 */

/**
 * One product in a slot being counted. Counts are strings because they back
 * text inputs; they only become numbers in `buildVisitSubmission`.
 */
export interface VisitRow {
  readonly slotCode: string;
  readonly productId: string;
  /** From the planogram at form open, so a later price edit can't rewrite this
   *  visit's revenue. */
  readonly priceCents: number;
  readonly par: number | null;
  /**
   * Units found in the slot ON ARRIVAL — before refilling, before pulling
   * anything out.
   *
   * `""` means NOT COUNTED, and must never be coerced to `0`. An omitted line
   * tells the engine `slot-not-counted` and it books no sale; a zero claims the
   * entire previous fill sold, inventing revenue that never happened. The two
   * are indistinguishable once stored, which is why a blank row is dropped
   * rather than defaulted.
   */
  readonly left: string;
  readonly removed: string;
  readonly removedReason: RemovalReason | null;
  /** The previous visit's walk-away level — the "filled to 10 last time"
   *  hint. Null when this slot has no history. */
  readonly previousLevel: number | null;
  /** The FRONT unit's date — the one that sells next, not the stock loaded
   *  behind it. `""` means NOT RECORDED and is sent as null, never coerced. */
  readonly bestBy: string;
  /** Last visit's date for this slot, for the hint. Null with no history. */
  readonly previousBestBy: string | null;
  /** False hides the date field entirely. */
  readonly tracksExpiration: boolean;
}

/** A line as the `visits.create` mutation takes it. */
export interface VisitLineDraft {
  slotCode: string;
  productId: string;
  remaining: number;
  added: number;
  removed: number;
  removedReason: RemovalReason | null;
  priceCents: number;
  par: number | null;
  bestBy: string | null;
}

/** What the planogram contributes to a row. Declared here, not imported, so
 *  this module stays independent of the wire. */
interface PlanogramSlotLike {
  slotCode: string;
  productId: string;
  par: number;
  priceCents: number;
}

/** What the product catalogue contributes to a row. Declared here, not
 *  imported, so this module stays independent of the wire. */
interface ProductLike {
  id: string;
  tracksExpiration: boolean;
}

interface PreviousVisitLike {
  lines: readonly VisitLine[];
}

/** A whole non-negative count, or null if the text isn't one. Rejects "1.5"
 *  and "-2"; `""` is the caller's business, not a parse failure. */
export const parseCount = (text: string): number | null => {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
};

/** Rejects an ISO instant and a non-padded date — both break the ordering. */
export const CALENDAR_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Matches the server's default window, so the slot row and the pre-trip
 *  report cannot disagree about what "soon" means. */
const EXPIRY_WINDOW_DAYS = 14;

export const isCounted = (row: VisitRow): boolean => row.left.trim() !== "";

/** Every product in the slot, front to back. A mixed slot has more than one. */
export const rowsInSlot = (
  rows: readonly VisitRow[],
  slotCode: string,
): VisitRow[] => rows.filter((row) => row.slotCode === slotCode);

/** A slot is counted only when every product in it is. */
export const isSlotCounted = (
  rows: readonly VisitRow[],
  slotCode: string,
): boolean => rowsInSlot(rows, slotCode).every(isCounted);

/** Slots with at least one product still uncounted, in walking order. */
export const uncountedSlotCodes = (rows: readonly VisitRow[]): string[] => [
  ...new Set(rows.filter((row) => !isCounted(row)).map((row) => row.slotCode)),
];

/** Identifies a row: the slot code alone repeats in a mixed slot. */
export const isSameRow = (a: VisitRow, b: VisitRow): boolean =>
  a.slotCode === b.slotCode && a.productId === b.productId;

/**
 * Units still in the slot once the Count pull is out, before anything is
 * loaded. Null while the row is half-typed.
 */
export const leftAfterPull = (row: VisitRow): number | null => {
  const remaining = parseCount(row.left);
  const removed = row.removed.trim() === "" ? 0 : parseCount(row.removed);
  if (remaining === null || removed === null) {
    return null;
  }
  return Math.max(0, remaining - removed);
};

export const rowWithLeft = (row: VisitRow, left: string): VisitRow => ({
  ...row,
  left,
});

export const rowWithRemoved = (row: VisitRow, removed: string): VisitRow => ({
  ...row,
  removed,
});

export const rowWithBestBy = (row: VisitRow, bestBy: string): VisitRow => ({
  ...row,
  bestBy,
});

export const rowWithRemovedReason = (
  row: VisitRow,
  removedReason: RemovalReason | null,
): VisitRow => ({ ...row, removedReason });

/** A row with nothing typed yet and no history behind it. */
const buildBlankRow = ({
  slotCode,
  productId,
  priceCents,
  par,
  tracksExpiration,
}: Pick<
  VisitRow,
  "slotCode" | "productId" | "priceCents" | "par" | "tracksExpiration"
>): VisitRow => ({
  slotCode,
  productId,
  priceCents,
  par,
  left: "",
  removed: "",
  removedReason: null,
  previousLevel: null,
  bestBy: "",
  previousBestBy: null,
  tracksExpiration,
});

/**
 * One row per product in each planogram-assigned slot, front to back, in the
 * machine's walking order. Unassigned slots get NO row: a line needs a product
 * and a price, and inventing either would store a fiction.
 */
export const buildVisitRows = ({
  shelves,
  planogramSlots,
  previousVisit,
  products,
}: {
  shelves: readonly string[][];
  planogramSlots: readonly PlanogramSlotLike[];
  previousVisit: PreviousVisitLike | null;
  products: readonly ProductLike[];
}): VisitRow[] => {
  const previousByKey = new Map<string, VisitLine>();
  for (const line of previousVisit?.lines ?? []) {
    previousByKey.set(slotProductKey(line), line);
  }
  const tracksExpirationById = new Map(
    products.map((product) => [product.id, product.tracksExpiration]),
  );

  const rows: VisitRow[] = [];
  for (const slotCode of shelves.flat()) {
    for (const slot of planogramSlots.filter((s) => s.slotCode === slotCode)) {
      const previous = previousByKey.get(slotProductKey(slot));
      rows.push({
        ...buildBlankRow({
          ...slot,
          // Defaults to true for a product not in the list: a slot that
          // silently stops asking for a date is the failure this whole feature
          // exists to avoid, so the safe default is to keep asking.
          tracksExpiration: tracksExpirationById.get(slot.productId) ?? true,
        }),
        previousLevel: previous ? levelAfter(previous) : null,
        bestBy: previous?.bestBy ?? "",
        previousBestBy: previous?.bestBy ?? null,
      });
    }
  }
  return rows;
};

/**
 * Things worth flagging on the cell, none of which block a submit — the engine
 * records what happened in the field and reports oddities rather than
 * rejecting them.
 */
export type RowWarning = "over-removed" | "expired" | "expiring-soon";

export const warningsFor = (
  row: VisitRow,
  { asOf }: { asOf: string },
): RowWarning[] => {
  const warnings: RowWarning[] = [];
  const remaining = parseCount(row.left);
  const removed = row.removed.trim() === "" ? 0 : parseCount(row.removed);
  if (remaining !== null && removed !== null && removed > remaining) {
    warnings.push("over-removed");
  }
  // A slot emptied by the pull has nothing left to go bad.
  const bestBy = row.bestBy.trim();
  if (bestBy !== "" && CALENDAR_DATE.test(bestBy) && (leftAfterPull(row) ?? 0) > 0) {
    const days = calendarDaysUntil(bestBy, asOf);
    if (days < 0) {
      warnings.push("expired");
    } else if (bestBy <= calendarDateAfter(asOf, EXPIRY_WINDOW_DAYS)) {
      warnings.push("expiring-soon");
    }
  }
  return warnings;
};
