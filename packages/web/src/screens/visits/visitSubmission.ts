import {
  type LayoutChange,
  type LayoutChangeViolation,
  type LayoutSlot,
  PLACEHOLDER_PAR,
  type RemovalReason,
  slotProductKey,
  slotsAfterChanges,
} from "@vendpire/domain";
import { formatCents, parseDollarsToCents } from "../../utils/money.ts";
import type { Arrival, ProductAction, PullReason, Restock } from "./restock.ts";
import {
  CALENDAR_DATE,
  isCounted,
  parseCount,
  type VisitLineDraft,
  type VisitRow,
} from "./visitRows.ts";

/**
 * Count and Restock as what the server saves: the visit lines, the layout
 * changes, and the planogram they produce. Pure. The review and the save both
 * read this, so they can't disagree. Verbs: `docs/diagrams/visit-layout-changes.md`.
 */

export type SubmissionProblem =
  | { kind: "unanswered"; slotCode: string; productId: string }
  | { kind: "answered-but-uncounted"; slotCode: string; productId: string }
  | { kind: "split-reason"; slotCode: string; productId: string }
  | { kind: "added-blank"; slotCode: string; productId: string }
  // The server takes one line per slot and product. Null reason: it moved out.
  | {
      kind: "left-and-came-back";
      slotCode: string;
      productId: string;
      pullReason: PullReason | null;
    }
  | { kind: "price-missing"; slotCode: string }
  // A slot without lines has nothing for a new price to ride on.
  | { kind: "price-change-uncounted"; slotCode: string; priceCentsBefore: number }
  | {
      kind: "invalid-count";
      slotCode: string;
      field: "left" | "added" | "removed" | "bestBy";
    }
  | { kind: "layout"; violation: LayoutChangeViolation }
  // The server takes at least one line.
  | { kind: "nothing-counted" };

export interface VisitSubmissionDraft {
  lines: VisitLineDraft[];
  layoutChanges: LayoutChange[];
  /** The review's after face. */
  slotsAfter: LayoutSlot[];
}

/** A Count row's numbers, parsed. */
interface RowCount {
  remaining: number;
  removed: number;
  removedReason: RemovalReason | null;
  bestBy: string;
}

/** `""` is 0 here: a blank Pulled means nothing was pulled. */
const parseOptionalCount = (text: string): number | null =>
  text.trim() === "" ? 0 : parseCount(text);

const isCalendarDateOrBlank = (bestBy: string): boolean =>
  bestBy === "" || CALENDAR_DATE.test(bestBy);

/** A date on an emptied slot describes stock that is not there. */
const bestByFor = (bestBy: string, level: number): string | null =>
  bestBy === "" || level === 0 ? null : bestBy;

const parseRowCount = (
  row: VisitRow,
): { count: RowCount } | { problems: SubmissionProblem[] } => {
  const { slotCode } = row;
  const problems: SubmissionProblem[] = [];
  const remaining = parseCount(row.left);
  if (remaining === null) {
    problems.push({ kind: "invalid-count", slotCode, field: "left" });
  }
  const removed = parseOptionalCount(row.removed);
  if (removed === null || (removed > 0 && row.removedReason === null)) {
    problems.push({ kind: "invalid-count", slotCode, field: "removed" });
  }
  const bestBy = row.bestBy.trim();
  if (!isCalendarDateOrBlank(bestBy)) {
    problems.push({ kind: "invalid-count", slotCode, field: "bestBy" });
  }
  if (remaining === null || removed === null || problems.length > 0) {
    return { problems };
  }
  return {
    count: {
      remaining,
      removed,
      // A reason without a removal is leftover UI state, not a fact.
      removedReason: removed > 0 ? row.removedReason : null,
      bestBy,
    },
  };
};

/** Added text as a number. Blank is its own problem: it is never 0. */
const parseAdded = (
  added: string,
  key: { slotCode: string; productId: string },
): { added: number } | { problem: SubmissionProblem } => {
  if (added.trim() === "") {
    return { problem: { kind: "added-blank", ...key } };
  }
  const parsed = parseCount(added);
  if (parsed === null) {
    return {
      problem: { kind: "invalid-count", slotCode: key.slotCode, field: "added" },
    };
  }
  return { added: parsed };
};

/**
 * Everything counted goes out under one reason. Sold out has nothing to pull,
 * and the server needs no reason for it.
 */
const departingLine = (
  row: VisitRow,
  count: RowCount,
  { reason, priceCents }: { reason: RemovalReason; priceCents: number },
): VisitLineDraft => ({
  slotCode: row.slotCode,
  productId: row.productId,
  remaining: count.remaining,
  added: 0,
  removed: count.remaining,
  removedReason: count.remaining > 0 ? reason : null,
  priceCents,
  par: row.par,
  bestBy: null,
});

/** A line has one `removed` and one reason, so a Count pull must match the way the rest left. */
const isSplitReason = (
  count: RowCount,
  action: Exclude<ProductAction, { kind: "added" }>,
): boolean => {
  if (count.removed === 0) {
    return false;
  }
  return action.kind === "moved" || count.removedReason !== action.reason;
};

export const buildVisitSubmission = ({
  rows,
  restock,
  planogramSlots,
}: {
  rows: readonly VisitRow[];
  restock: Restock;
  planogramSlots: readonly LayoutSlot[];
}): { submission: VisitSubmissionDraft } | { problems: SubmissionProblem[] } => {
  const problems: SubmissionProblem[] = [];
  const lines: VisitLineDraft[] = [];
  const moveChanges: LayoutChange[] = [];
  const removeChanges: LayoutChange[] = [];
  const newStockChanges: LayoutChange[] = [];
  const stockedSlotCodes = new Set<string>();
  const priceMissingSlotCodes = new Set<string>();

  const priceBeforeBySlot = new Map<string, number>();
  for (const slot of planogramSlots) {
    priceBeforeBySlot.set(slot.slotCode, slot.priceCents);
  }

  const priceAfterOf = (slotCode: string): number | null =>
    parseDollarsToCents(restock.prices[slotCode] ?? "");

  /** The after price for a line that stays or arrives; a missing one is reported once per slot. */
  const priceStockedLine = (slotCode: string): number => {
    stockedSlotCodes.add(slotCode);
    const priceAfter = priceAfterOf(slotCode);
    if (priceAfter !== null) {
      return priceAfter;
    }
    if (!priceMissingSlotCodes.has(slotCode)) {
      priceMissingSlotCodes.add(slotCode);
      problems.push({ kind: "price-missing", slotCode });
    }
    return 0;
  };

  for (const row of rows) {
    const { slotCode, productId } = row;
    const action = restock.actions[slotProductKey(row)];

    if (!isCounted(row)) {
      if (action !== undefined) {
        problems.push({ kind: "answered-but-uncounted", slotCode, productId });
      }
      continue;
    }

    const parsed = parseRowCount(row);
    if ("problems" in parsed) {
      problems.push(...parsed.problems);
      continue;
    }
    const { count } = parsed;

    if (action === undefined) {
      problems.push({ kind: "unanswered", slotCode, productId });
      continue;
    }

    if (action.kind === "added") {
      const added = parseAdded(action.added, { slotCode, productId });
      if ("problem" in added) {
        problems.push(added.problem);
        continue;
      }
      const level = count.remaining - count.removed + added.added;
      lines.push({
        slotCode,
        productId,
        remaining: count.remaining,
        added: added.added,
        removed: count.removed,
        removedReason: count.removedReason,
        priceCents: priceStockedLine(slotCode),
        par: row.par,
        bestBy: bestByFor(count.bestBy, level),
      });
      continue;
    }

    if (isSplitReason(count, action)) {
      problems.push({ kind: "split-reason", slotCode, productId });
      continue;
    }
    const priceCents = priceBeforeBySlot.get(slotCode) ?? row.priceCents;
    if (action.kind === "moved") {
      lines.push(departingLine(row, count, { reason: "transferred", priceCents }));
      moveChanges.push({
        kind: "move",
        productId,
        fromSlotCode: slotCode,
        toSlotCode: action.toSlotCode,
      });
      continue;
    }
    lines.push(departingLine(row, count, { reason: action.reason, priceCents }));
    removeChanges.push({ kind: "remove", slotCode, productId });
  }

  for (const arrival of restock.arrivals) {
    const arrivalLine = buildArrivalLine(arrival);
    if ("problem" in arrivalLine) {
      problems.push(arrivalLine.problem);
      continue;
    }
    lines.push({ ...arrivalLine.line, priceCents: priceStockedLine(arrival.slotCode) });
    // A linked arrival's change is its source's move.
    if (arrival.fromSlotCode === null) {
      newStockChanges.push({
        kind: "add",
        slotCode: arrival.slotCode,
        productId: arrival.productId,
      });
    }
  }

  problems.push(...leftAndCameBackProblems(lines, restock));
  problems.push(
    ...uncountedPriceChangeProblems({
      slotCodes: Object.keys(restock.prices),
      lineSlotCodes: new Set(lines.map((line) => line.slotCode)),
      priceBeforeBySlot,
      priceAfterOf,
    }),
  );

  const priceChanges = buildPriceChanges({
    slotCodes: [...new Set([...Object.keys(restock.prices), ...stockedSlotCodes])],
    stockedSlotCodes,
    priceBeforeBySlot,
    priceAfterOf,
  });
  const layoutChanges = [
    ...moveChanges,
    ...removeChanges,
    ...newStockChanges,
    ...priceChanges,
  ];

  const after = slotsAfterChanges(planogramSlots, layoutChanges);
  if ("violation" in after) {
    const { violation } = after;
    if (violation.kind !== "missing-price") {
      problems.push({ kind: "layout", violation });
    } else if (!priceMissingSlotCodes.has(violation.slotCode)) {
      problems.push({ kind: "price-missing", slotCode: violation.slotCode });
    }
  }

  if (problems.length === 0 && lines.length === 0) {
    problems.push({ kind: "nothing-counted" });
  }
  if (problems.length > 0 || "violation" in after) {
    return { problems };
  }
  return { submission: { lines, layoutChanges, slotsAfter: after.slots } };
};

/**
 * A product that left a slot and arrived in it again gives two lines for one
 * slot and product. One that stayed is a layout problem instead.
 */
const leftAndCameBackProblems = (
  lines: readonly VisitLineDraft[],
  restock: Restock,
): SubmissionProblem[] => {
  const problems: SubmissionProblem[] = [];
  const seenKeys = new Set<string>();
  for (const line of lines) {
    const key = slotProductKey(line);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      continue;
    }
    const action = restock.actions[key];
    if (action === undefined || action.kind === "added") {
      continue;
    }
    problems.push({
      kind: "left-and-came-back",
      slotCode: line.slotCode,
      productId: line.productId,
      pullReason: action.kind === "pulled" ? action.reason : null,
    });
  }
  return problems;
};

/** An arrival's line, priced by the caller: it has no `remaining`, only what went in. */
const buildArrivalLine = (
  arrival: Arrival,
): { line: Omit<VisitLineDraft, "priceCents"> } | { problem: SubmissionProblem } => {
  const { slotCode, productId } = arrival;
  const added = parseAdded(arrival.added, { slotCode, productId });
  if ("problem" in added) {
    return added;
  }
  const bestBy = arrival.bestBy.trim();
  if (!isCalendarDateOrBlank(bestBy)) {
    return { problem: { kind: "invalid-count", slotCode, field: "bestBy" } };
  }
  return {
    line: {
      slotCode,
      productId,
      remaining: 0,
      added: added.added,
      removed: 0,
      removedReason: null,
      par: PLACEHOLDER_PAR,
      bestBy: bestByFor(bestBy, added.added),
    },
  };
};

/**
 * A `set-price` for each slot that holds a product after Restock and whose
 * price changed or never existed. An emptied slot keeps no planogram entry for
 * a price to land on.
 */
const buildPriceChanges = ({
  slotCodes,
  stockedSlotCodes,
  priceBeforeBySlot,
  priceAfterOf,
}: {
  slotCodes: readonly string[];
  stockedSlotCodes: ReadonlySet<string>;
  priceBeforeBySlot: ReadonlyMap<string, number>;
  priceAfterOf: (slotCode: string) => number | null;
}): LayoutChange[] => {
  const changes: LayoutChange[] = [];
  for (const slotCode of slotCodes) {
    const priceAfter = priceAfterOf(slotCode);
    if (!stockedSlotCodes.has(slotCode) || priceAfter === null) {
      continue;
    }
    if (priceBeforeBySlot.get(slotCode) === priceAfter) {
      continue;
    }
    changes.push({ kind: "set-price", slotCode, priceCents: priceAfter });
  }
  return changes;
};

/** A slot whose price input moved off its planogram price but that produced no lines. */
const uncountedPriceChangeProblems = ({
  slotCodes,
  lineSlotCodes,
  priceBeforeBySlot,
  priceAfterOf,
}: {
  slotCodes: readonly string[];
  lineSlotCodes: ReadonlySet<string>;
  priceBeforeBySlot: ReadonlyMap<string, number>;
  priceAfterOf: (slotCode: string) => number | null;
}): SubmissionProblem[] => {
  const problems: SubmissionProblem[] = [];
  for (const slotCode of slotCodes) {
    const priceCentsBefore = priceBeforeBySlot.get(slotCode);
    if (priceCentsBefore === undefined || lineSlotCodes.has(slotCode)) {
      continue;
    }
    if (priceAfterOf(slotCode) === priceCentsBefore) {
      continue;
    }
    problems.push({ kind: "price-change-uncounted", slotCode, priceCentsBefore });
  }
  return problems;
};

const INVALID_COUNT_MESSAGES: Record<
  Extract<SubmissionProblem, { kind: "invalid-count" }>["field"],
  string
> = {
  left: `"Found in slot" must be a whole number (0 if none were there)`,
  added: `"Added" must be a whole number`,
  removed: `"Pulled out" must be a whole number, with a reason`,
  bestBy: `"Best by" must be a date like 2026-12-15`,
};

const violationMessage = (
  violation: LayoutChangeViolation,
  nameOf: (productId: string) => string,
): string => {
  switch (violation.kind) {
    case "product-not-in-slot":
      return `Slot ${violation.slotCode}: ${nameOf(violation.productId)} isn't in this slot to move or pull`;
    case "product-already-in-slot":
      return `Slot ${violation.slotCode}: ${nameOf(violation.productId)} is already in this slot`;
    case "missing-price":
      return `Slot ${violation.slotCode}: enter a price`;
    case "move-to-same-slot":
      return `Slot ${violation.slotCode}: a product can't move to the slot it's already in`;
  }
};

const leftAndCameBackMessage = (
  { slotCode, productId, pullReason }: Extract<SubmissionProblem, { kind: "left-and-came-back" }>,
  nameOf: (productId: string) => string,
): string => {
  const name = nameOf(productId);
  if (pullReason === null) {
    return `${slotCode}: ${name} moved out and came back in. Use Add here, and move the other ${name} straight to where this one went, instead.`;
  }
  return `${slotCode}: ${name} left and came back. Record it as Added, with the ${pullReason} units as a Count pull, instead.`;
};

export const problemMessage = (
  problem: SubmissionProblem,
  nameOf: (productId: string) => string,
): string => {
  switch (problem.kind) {
    case "unanswered":
      return `Slot ${problem.slotCode}: say what happened to ${nameOf(problem.productId)} in Restock`;
    case "answered-but-uncounted":
      return `Slot ${problem.slotCode}: ${nameOf(problem.productId)} has a Restock answer but no "Found in slot" count`;
    case "split-reason":
      return `Slot ${problem.slotCode}: ${nameOf(problem.productId)} was pulled in Count for a different reason than it left in Restock; record every unit under one reason`;
    case "added-blank":
      return `Slot ${problem.slotCode}: enter "Added" for ${nameOf(problem.productId)} (0 if none went in)`;
    case "left-and-came-back":
      return leftAndCameBackMessage(problem, nameOf);
    case "price-missing":
      return `Slot ${problem.slotCode}: enter a price`;
    case "price-change-uncounted":
      return `Count ${problem.slotCode} to change its price, or put the price back to ${formatCents(problem.priceCentsBefore)}.`;
    case "invalid-count":
      return `Slot ${problem.slotCode}: ${INVALID_COUNT_MESSAGES[problem.field]}`;
    case "layout":
      return violationMessage(problem.violation, nameOf);
    case "nothing-counted":
      return "Count at least one slot before saving this visit";
  }
};
