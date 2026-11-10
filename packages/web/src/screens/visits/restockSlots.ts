import { slotProductKey } from "@vendpire/domain";
import { arrivalsIn, type Restock } from "./restock.ts";
import { isCounted, leftAfterPull, parseCount, type VisitRow } from "./visitRows.ts";
import type { SubmissionProblem } from "./visitSubmission.ts";

/**
 * What the Restock grid and footer say about each slot. Pure; reads rows and
 * the Restock, never the stale actions of rows Count has since removed.
 */

export interface RestockSlot {
  rows: readonly VisitRow[];
  restock: Restock;
  slotCode: string;
}

const rowsOf = ({ rows, slotCode }: RestockSlot): VisitRow[] =>
  rows.filter((row) => row.slotCode === slotCode);

const isStaying = (row: VisitRow, restock: Restock): boolean => {
  const action = restock.actions[slotProductKey(row)];
  return action === undefined || action.kind === "added";
};

/** Products in the slot once Restock is done, front to back: the ones that
 *  stayed (or have no answer yet), then the arrivals. */
export const productIdsAfterRestock = (slot: RestockSlot): string[] => [
  ...rowsOf(slot)
    .filter((row) => isStaying(row, slot.restock))
    .map((row) => row.productId),
  ...arrivalsIn(slot.restock, slot.slotCode).map((arrival) => arrival.productId),
];

/** Counted rows and arrivals are the only things Restock asks about; an
 *  uncounted row goes back to Count instead. */
export const hasRestockQuestions = (slot: RestockSlot): boolean =>
  rowsOf(slot).some(isCounted) ||
  arrivalsIn(slot.restock, slot.slotCode).length > 0;

/** Every counted product has an action with a non-blank Added where one is
 *  asked, and every arrival has its Added. False when there is nothing to
 *  answer. */
export const isSlotAnswered = (slot: RestockSlot): boolean => {
  if (!hasRestockQuestions(slot)) {
    return false;
  }
  const areRowsAnswered = rowsOf(slot)
    .filter(isCounted)
    .every((row) => {
      const action = slot.restock.actions[slotProductKey(row)];
      if (action === undefined) {
        return false;
      }
      return action.kind !== "added" || action.added.trim() !== "";
    });
  const areArrivalsAnswered = arrivalsIn(slot.restock, slot.slotCode).every(
    (arrival) => arrival.added.trim() !== "",
  );
  return areRowsAnswered && areArrivalsAnswered;
};

export const restockProgressFor = ({
  rows,
  restock,
  slotCodes,
}: {
  rows: readonly VisitRow[];
  restock: Restock;
  slotCodes: readonly string[];
}): { answeredCount: number; totalCount: number } => {
  const slots = slotCodes
    .map((slotCode) => ({ rows, restock, slotCode }))
    .filter(hasRestockQuestions);
  return {
    answeredCount: slots.filter(isSlotAnswered).length,
    totalCount: slots.length,
  };
};

/**
 * The derived Now when the slot holds exactly one product after Restock: Left
 * − pulled + Added for a product that stayed, Added for an arrival, 0 for a
 * slot everything left. Null while anything it needs is blank or unparseable.
 */
export const nowLevelAfterRestock = (slot: RestockSlot): number | null => {
  const productIds = productIdsAfterRestock(slot);
  if (productIds.length === 0) {
    return rowsOf(slot).length > 0 && isSlotAnswered(slot) ? 0 : null;
  }
  if (productIds.length > 1) {
    return null;
  }
  const [arrival] = arrivalsIn(slot.restock, slot.slotCode);
  if (arrival) {
    return parseCount(arrival.added);
  }
  const row = rowsOf(slot).find((candidate) => isStaying(candidate, slot.restock));
  const action = row ? slot.restock.actions[slotProductKey(row)] : undefined;
  if (!row || action?.kind !== "added") {
    return null;
  }
  const left = leftAfterPull(row);
  const added = parseCount(action.added);
  if (left === null || added === null) {
    return null;
  }
  return left + added;
};

/**
 * The slot a problem should mark for attention. Unanswered and blank-Added
 * problems are just work not done yet, so they mark nothing.
 */
export const attentionSlotCodeFor = (problem: SubmissionProblem): string | null => {
  switch (problem.kind) {
    case "unanswered":
    case "added-blank":
    case "nothing-counted":
      return null;
    case "layout":
      return problem.violation.slotCode;
    default:
      return problem.slotCode;
  }
};
