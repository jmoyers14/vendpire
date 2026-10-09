import { levelAfter, type RemovalReason, type VisitLine } from "@vendpire/domain";

/**
 * The visit-entry form's state and its conversion to a submittable draft.
 *
 * Every rule that decides WHAT GETS SENT lives here rather than in the screen,
 * because these rules are where a visit becomes wrong in ways nothing
 * downstream can detect. Pure, so they're tested without a browser.
 */

/**
 * One slot being counted. Counts are strings because they back text inputs;
 * they only become numbers in `buildVisitLines`.
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
   * are indistinguishable once stored, which is why a blank row is dropped in
   * `buildVisitLines` rather than defaulted.
   */
  readonly left: string;
  readonly added: string;
  /** Set once the operator types in Added, which retires the fill-to-par
   *  default so a later Left edit can't overwrite a deliberate number. */
  readonly isAddedEdited: boolean;
  readonly removed: string;
  readonly removedReason: RemovalReason | null;
  /** The previous visit's walk-away level — the "filled to 10 last time"
   *  hint. Null when this slot has no history. */
  readonly previousLevel: number | null;
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
}

export type VisitLinesResult =
  | { readonly lines: VisitLineDraft[] }
  | { readonly error: string };

/** What the planogram contributes to a row. Declared here, not imported, so
 *  this module stays independent of the wire. */
interface PlanogramSlotLike {
  slotCode: string;
  productId: string;
  par: number;
  priceCents: number;
}

interface PreviousVisitLike {
  lines: readonly VisitLine[];
}

/** NUL-joined, matching the engine: a slot carries both its outgoing and
 *  incoming product on a re-planogram visit, so the code alone isn't a key. */
const keyOf = (slotCode: string, productId: string): string =>
  `${slotCode}\u0000${productId}`;

/** A whole non-negative count, or null if the text isn't one. Rejects "1.5"
 *  and "-2"; `""` is the caller's business, not a parse failure. */
const parseCount = (text: string): number | null => {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
};

/** A row as a line, with its counts still to be filled in. */
const toLine = (row: VisitRow): VisitLineDraft => ({
  slotCode: row.slotCode,
  productId: row.productId,
  remaining: 0,
  added: 0,
  removed: 0,
  removedReason: row.removedReason,
  priceCents: row.priceCents,
  par: row.par,
});

export const isCounted = (row: VisitRow): boolean => row.left.trim() !== "";

/**
 * How full the slot will be when you walk away. Null while the row is still
 * half-typed. Delegates to the engine's `levelAfter` rather than restating
 * `left − removed + added`, so the form and the P&L can't disagree.
 */
export const levelOf = (row: VisitRow): number | null => {
  const remaining = parseCount(row.left);
  if (remaining === null) {
    return null;
  }
  const added = row.added.trim() === "" ? 0 : parseCount(row.added);
  const removed = row.removed.trim() === "" ? 0 : parseCount(row.removed);
  if (added === null || removed === null) {
    return null;
  }
  return levelAfter({ ...toLine(row), remaining, added, removed });
};

/**
 * The fill-to-par default: enough to bring the slot back to par, counting the
 * units you're about to pull out. `""` when there's nothing to compute from —
 * a guess here would be a number the operator never entered.
 */
export const fillToPar = (row: VisitRow): string => {
  const remaining = parseCount(row.left);
  if (row.par === null || remaining === null) {
    return "";
  }
  const removed = row.removed.trim() === "" ? 0 : (parseCount(row.removed) ?? 0);
  return String(Math.max(0, row.par - (remaining - removed)));
};

const withFillToPar = (row: VisitRow): VisitRow =>
  row.isAddedEdited ? row : { ...row, added: fillToPar(row) };

export const rowWithLeft = (row: VisitRow, left: string): VisitRow =>
  withFillToPar({ ...row, left });

export const rowWithRemoved = (row: VisitRow, removed: string): VisitRow =>
  withFillToPar({ ...row, removed });

/** Typing in Added is the operator overriding the default, permanently. */
export const rowWithAdded = (row: VisitRow, added: string): VisitRow => ({
  ...row,
  added,
  isAddedEdited: true,
});

export const rowWithRemovedReason = (
  row: VisitRow,
  removedReason: RemovalReason | null,
): VisitRow => ({ ...row, removedReason });

/**
 * One row per planogram-assigned slot, in the machine's walking order. Slots
 * the planogram leaves unassigned get NO row: a line needs a product and a
 * price, and inventing either would store a fiction.
 */
export const buildVisitRows = ({
  shelves,
  planogramSlots,
  previousVisit,
}: {
  shelves: readonly string[][];
  planogramSlots: readonly PlanogramSlotLike[];
  previousVisit: PreviousVisitLike | null;
}): VisitRow[] => {
  const previousByKey = new Map<string, VisitLine>();
  for (const line of previousVisit?.lines ?? []) {
    previousByKey.set(keyOf(line.slotCode, line.productId), line);
  }

  const rows: VisitRow[] = [];
  for (const slotCode of shelves.flat()) {
    const slot = planogramSlots.find((s) => s.slotCode === slotCode);
    if (!slot) {
      continue;
    }
    const previous = previousByKey.get(keyOf(slotCode, slot.productId));
    rows.push({
      slotCode,
      productId: slot.productId,
      priceCents: slot.priceCents,
      par: slot.par,
      left: "",
      added: "",
      isAddedEdited: false,
      removed: "",
      removedReason: null,
      previousLevel: previous ? levelAfter(previous) : null,
    });
  }
  return rows;
};

/**
 * The counted rows as lines, or the first problem found. Uncounted rows are
 * dropped, NOT sent as zero — see `VisitRow.left`.
 *
 * Mirrors the server's own refusal to default a removal reason: it decides
 * loss vs. transfer, and either default would overstate or hide a write-off.
 */
export const buildVisitLines = (rows: readonly VisitRow[]): VisitLinesResult => {
  const lines: VisitLineDraft[] = [];

  for (const row of rows) {
    if (!isCounted(row)) {
      continue;
    }
    const remaining = parseCount(row.left);
    if (remaining === null) {
      return {
        error: `Slot ${row.slotCode}: "Left in slot" must be a whole number`,
      };
    }
    const added = row.added.trim() === "" ? 0 : parseCount(row.added);
    if (added === null) {
      return { error: `Slot ${row.slotCode}: "Added" must be a whole number` };
    }
    const removed = row.removed.trim() === "" ? 0 : parseCount(row.removed);
    if (removed === null) {
      return { error: `Slot ${row.slotCode}: "Removed" must be a whole number` };
    }
    if (removed > 0 && row.removedReason === null) {
      return {
        error: `Slot ${row.slotCode}: choose a reason for the ${removed} unit(s) pulled out`,
      };
    }
    lines.push({
      ...toLine(row),
      remaining,
      added,
      removed,
      // A reason without a removal is leftover UI state, not a fact.
      removedReason: removed > 0 ? row.removedReason : null,
    });
  }

  if (lines.length === 0) {
    return { error: "Count at least one slot before saving this visit" };
  }
  return { lines };
};

/**
 * Things worth flagging on the cell, none of which block a submit — the engine
 * records what happened in the field and reports oddities rather than
 * rejecting them.
 */
export type RowWarning = "over-par" | "over-removed";

export const warningsFor = (row: VisitRow): RowWarning[] => {
  const warnings: RowWarning[] = [];
  const remaining = parseCount(row.left);
  const removed = row.removed.trim() === "" ? 0 : parseCount(row.removed);
  if (remaining !== null && removed !== null && removed > remaining) {
    warnings.push("over-removed");
  }
  const level = levelOf(row);
  if (level !== null && row.par !== null && level > row.par) {
    warnings.push("over-par");
  }
  return warnings;
};
