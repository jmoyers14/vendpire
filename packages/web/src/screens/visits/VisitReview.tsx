import type { LayoutSlot, SlotProduct } from "@vendpire/domain";
import { useState } from "react";
import {
  Alert,
  Button,
  ErrorNote,
  Field,
  FieldRow,
  RowTable,
  RowTableBody,
  RowTableEmpty,
  RowTableHeader,
  RowTableRow,
  TextArea,
  TextInput,
} from "../../ui.tsx";
import { formatCents } from "../../utils/money.ts";
import { plural } from "../../utils/text.ts";
import { describeChanges } from "./changeList.ts";
import { attentionSlotCodeFor } from "./restockSlots.ts";
import { EditorCard, EditorFooter } from "./SlotEditor.tsx";
import {
  hasActivity,
  type ProductActivity,
  visitTotalsFor,
} from "./visitActivity.ts";
import {
  type buildVisitSubmission,
  problemMessage,
  type SubmissionProblem,
} from "./visitSubmission.ts";

type VisitSubmissionResult = ReturnType<typeof buildVisitSubmission>;
type VisitStepName = "count" | "restock";

/** Count problems are fixed in Count; everything else in Restock. */
const stepFor = (problem: SubmissionProblem): VisitStepName =>
  problem.kind === "invalid-count" || problem.kind === "answered-but-uncounted"
    ? "count"
    : "restock";

// Unanswered slots get their own warning row with "Mark unchanged".
const isUnansweredWork = (problem: SubmissionProblem): boolean =>
  problem.kind === "unanswered" || problem.kind === "added-blank";

const REVIEW_COLUMNS = "48px minmax(0,2.6fr) repeat(5,minmax(0,0.9fr))";

/** The last step: totals, anything still open, what changed, and Save. */
export function VisitReview({
  submissionResult,
  activities,
  planogramSlots,
  productName,
  uncountedSlotCodes,
  unansweredSlotCount,
  onShowSlot,
  onClearAnswer,
  onMarkRestUnchanged,
  onBackToRestock,
  countedAtInput,
  onCountedAtInputChange,
  notes,
  onNotesChange,
  isSaving,
  saveError,
  onSave,
}: {
  submissionResult: VisitSubmissionResult;
  activities: readonly ProductActivity[];
  planogramSlots: readonly LayoutSlot[];
  productName: (productId: string) => string;
  /** Slots with a product still uncounted, which Save asks about first. */
  uncountedSlotCodes: readonly string[];
  unansweredSlotCount: number;
  /** Goes to a step with the slot selected. */
  onShowSlot: (target: { step: VisitStepName; slotCode: string }) => void;
  /** Drops the Restock answer of a row whose count was blanked. */
  onClearAnswer: (row: SlotProduct) => void;
  onMarkRestUnchanged: () => void;
  onBackToRestock: () => void;
  countedAtInput: string;
  onCountedAtInputChange: (countedAtInput: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  isSaving: boolean;
  /** Why the last Save failed, shown beside Save. */
  saveError: string | null;
  onSave: () => void;
}) {
  const [isShowingAll, setIsShowingAll] = useState(false);
  const [isUncountedWarningShown, setIsUncountedWarningShown] = useState(false);

  const problems = "problems" in submissionResult ? submissionResult.problems : [];
  // A mixed slot can report the same problem once per product.
  const problemItems = [
    ...new Map(
      problems
        .filter((problem) => !isUnansweredWork(problem))
        .map((problem) => [problemMessage(problem, productName), problem]),
    ),
  ];
  const changeDescriptions =
    "submission" in submissionResult
      ? describeChanges({
          submission: submissionResult.submission,
          planogramSlots,
          nameOf: productName,
        })
      : [];
  const totals = visitTotalsFor(activities);
  const activeRows = activities.filter(hasActivity);
  const shownRows = isShowingAll ? activities : activeRows;
  const [firstUncounted] = uncountedSlotCodes;

  const handleSave = () => {
    if (uncountedSlotCodes.length > 0) {
      setIsUncountedWarningShown(true);
      return;
    }
    onSave();
  };

  const stats = [
    { label: "Sold", value: totals.soldCount === null ? "—" : String(totals.soldCount) },
    { label: "Est. revenue", value: formatCents(totals.revenueCents) },
    { label: "Added", value: `+${totals.addedCount}` },
    { label: "Pulled", value: String(totals.pulledCount) },
  ];

  return (
    <EditorCard label="Review visit">
      <header className="grid gap-1 border-b border-divider pb-6">
        <h2 className="font-display text-title text-ink">Review visit</h2>
        <p className="text-body text-muted-strong">
          Check the numbers, then save. Click a slot on the map to fix it.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-control border border-divider bg-app p-4">
            <dt className="text-overline text-muted-strong uppercase">{stat.label}</dt>
            <dd className="mt-1 font-display text-stat text-ink tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {firstUncounted || unansweredSlotCount > 0 || problemItems.length > 0 ? (
        <div className="grid gap-3">
          {firstUncounted ? (
            <Alert
              tone="warning"
              title={`${plural(uncountedSlotCodes.length, { one: "slot wasn't", many: "slots weren't" })} counted, so their sales are missing from the totals.`}
              action={
                <Button
                  variant="text"
                  onClick={() => onShowSlot({ step: "count", slotCode: firstUncounted })}
                >
                  Count them
                </Button>
              }
            />
          ) : null}
          {unansweredSlotCount > 0 ? (
            <Alert
              tone="warning"
              title={`${plural(unansweredSlotCount, { one: "slot has", many: "slots have" })} no restock answer yet.`}
              action={
                <Button variant="text" onClick={onMarkRestUnchanged}>
                  Mark unchanged
                </Button>
              }
            />
          ) : null}
          {problemItems.map(([message, problem]) => {
            const slotCode = attentionSlotCodeFor(problem);
            return (
              <Alert
                key={message}
                tone="warning"
                title={message}
                action={
                  <>
                    {problem.kind === "answered-but-uncounted" ? (
                      <Button variant="text" onClick={() => onClearAnswer(problem)}>
                        Clear answer
                      </Button>
                    ) : null}
                    {slotCode === null ? null : (
                      <Button
                        variant="text"
                        onClick={() => onShowSlot({ step: stepFor(problem), slotCode })}
                      >
                        Fix {slotCode}
                      </Button>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-body font-bold text-ink">
            {isShowingAll ? "All slots" : `Slots with activity (${activeRows.length})`}
          </h3>
          <Button variant="text" onClick={() => setIsShowingAll(!isShowingAll)}>
            {isShowingAll ? "Show activity only" : "Show all slots"}
          </Button>
        </div>
        <RowTable columns={REVIEW_COLUMNS} minWidth="640px">
            <RowTableHeader>
              <span>Slot</span>
              <span>Product</span>
              <span className="text-right">Found</span>
              <span className="text-right">Sold</span>
              <span className="text-right">Added</span>
              <span className="text-right">Pulled</span>
              <span className="text-right">Now</span>
            </RowTableHeader>
            {shownRows.length === 0 ? (
              <RowTableEmpty>Nothing sold, added or pulled yet.</RowTableEmpty>
            ) : (
              <RowTableBody>
                {shownRows.map((activity, index) => (
                  <ReviewRow
                    key={`${activity.slotCode}-${activity.productId}-${activity.outcome}`}
                    activity={activity}
                    isFirstInSlot={shownRows[index - 1]?.slotCode !== activity.slotCode}
                    productName={productName(activity.productId)}
                  />
                ))}
              </RowTableBody>
            )}
        </RowTable>
      </div>

      {changeDescriptions.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-body font-bold text-ink">Layout changes</h3>
          <ul className="list-disc pl-5 text-body text-ink-soft">
            {changeDescriptions.map((description) => (
              <li key={description}>{description}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <FieldRow>
        <Field
          label="Counted at"
          hint="When you stood at the machine. Back-date it if you're entering this later."
        >
          <TextInput
            type="datetime-local"
            value={countedAtInput}
            onChange={(event) => onCountedAtInputChange(event.target.value)}
          />
        </Field>
        <Field label="Notes" isOptional>
          <TextArea
            rows={2}
            placeholder="e.g. Jammed coil, cold deck warm"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
          />
        </Field>
      </FieldRow>

      {isUncountedWarningShown ? (
        <Alert
          tone="warning"
          title={`${plural(uncountedSlotCodes.length, { one: "slot wasn't", many: "slots weren't" })} fully counted: ${uncountedSlotCodes.join(", ")}.`}
        >
          <p>
            An uncounted slot gets no line at all, so it shows as not counted
            rather than an invented sold figure. Those slots will show no sales
            for this interval.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={onSave} disabled={isSaving || problems.length > 0}>
              Save anyway
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsUncountedWarningShown(false)}
            >
              Keep counting
            </Button>
          </div>
        </Alert>
      ) : null}

      <ErrorNote message={saveError} />

      <EditorFooter
        hint={
          <Button variant="secondary" onClick={onBackToRestock}>
            ← Back to restock
          </Button>
        }
      >
        <Button
          onClick={handleSave}
          disabled={isSaving || problems.length > 0 || isUncountedWarningShown}
        >
          {isSaving ? "Saving…" : "Save visit"}
        </Button>
      </EditorFooter>
    </EditorCard>
  );
}

const numberOrDash = (value: number | null, { isSigned = false } = {}) => {
  if (value === null) {
    return "—";
  }
  return isSigned && value > 0 ? `+${value}` : String(value);
};

function ReviewRow({
  activity,
  isFirstInSlot,
  productName,
}: {
  activity: ProductActivity;
  isFirstInSlot: boolean;
  productName: string;
}) {
  const nowText =
    activity.now === null
      ? "—"
      : `${activity.now}${activity.par === null ? "" : ` / ${activity.par}`}`;
  const cells = [
    numberOrDash(activity.found),
    numberOrDash(activity.sold),
    numberOrDash(activity.added, { isSigned: true }),
    String(activity.pulled),
    nowText,
  ];
  return (
    <RowTableRow className="text-body">
      <span className="font-mono text-body-sm text-muted-strong">
        {isFirstInSlot ? activity.slotCode : ""}
      </span>
      <span className="grid min-w-0">
        <span className="truncate font-bold text-ink">{productName}</span>
        {activity.notes.length > 0 ? (
          <span className="text-body-sm text-muted-strong">{activity.notes.join(" · ")}</span>
        ) : null}
      </span>
      {cells.map((cell, index) => (
        <span
          // Columns are positional and fixed: Found, Sold, Added, Pulled, Now.
          key={index}
          className="text-right font-mono text-body-sm text-ink tabular-nums"
        >
          {cell}
        </span>
      ))}
    </RowTableRow>
  );
}
