import { useState } from "react";
import type { LayoutSlot, SlotProduct } from "@vendpire/domain";
import {
  Alert,
  Button,
  Card,
  countInputClass,
  hintClass,
  inputClass,
  labelClass,
} from "../../ui.tsx";
import { describeChanges } from "./changeList.ts";
import { ReviewFace } from "./ReviewFace.tsx";
import { attentionSlotCodeFor } from "./restockSlots.ts";
import { buildAfterFace, buildBeforeFace } from "./reviewFaces.ts";
import type { VisitRow } from "./visitRows.ts";
import {
  problemMessage,
  type buildVisitSubmission,
  type SubmissionProblem,
} from "./visitSubmission.ts";

type VisitSubmissionResult = ReturnType<typeof buildVisitSubmission>;
type VisitStepName = "count" | "restock";

/** Count problems are fixed in Count; everything else in Restock. */
const stepFor = (problem: SubmissionProblem): VisitStepName =>
  problem.kind === "invalid-count" || problem.kind === "answered-but-uncounted"
    ? "count"
    : "restock";

type FaceSide = "before" | "after";

/** The last step: what will be saved, anything blocking it, and Save. */
export function VisitReview({
  submissionResult,
  shelves,
  rows,
  planogramSlots,
  onShowSlot,
  onClearAnswer,
  uncountedSlotCodes,
  productName,
  countedAtInput,
  onCountedAtInputChange,
  notes,
  onNotesChange,
  isSaving,
  onSave,
}: {
  submissionResult: VisitSubmissionResult;
  shelves: string[][];
  rows: readonly VisitRow[];
  planogramSlots: readonly LayoutSlot[];
  /** Goes to a step with the slot selected. */
  onShowSlot: (target: { step: VisitStepName; slotCode: string }) => void;
  /** Drops the Restock answer of a row whose count was blanked. */
  onClearAnswer: (row: SlotProduct) => void;
  /** Slots with a product still uncounted, which Save asks about first. */
  uncountedSlotCodes: readonly string[];
  productName: (productId: string) => string;
  countedAtInput: string;
  onCountedAtInputChange: (countedAtInput: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  isSaving: boolean;
  onSave: () => void;
}) {
  const [isUncountedWarningShown, setIsUncountedWarningShown] = useState(false);
  const [side, setSide] = useState<FaceSide>("after");
  const problems =
    "problems" in submissionResult ? submissionResult.problems : [];
  // A mixed slot can report the same problem once per product.
  const problemItems = [
    ...new Map(
      problems.map((problem) => [
        problemMessage(problem, productName),
        problem,
      ]),
    ),
  ];
  const beforeFace = buildBeforeFace({ planogramSlots, rows });
  const afterFace =
    "submission" in submissionResult
      ? buildAfterFace({
          planogramSlots,
          rows,
          submission: submissionResult.submission,
        })
      : null;
  const changeDescriptions =
    "submission" in submissionResult
      ? describeChanges({
          submission: submissionResult.submission,
          planogramSlots,
          nameOf: productName,
        })
      : [];
  const sideClass = (faceSide: FaceSide) =>
    `${side === faceSide ? "" : "hidden"} sm:block`;

  const handleSave = () => {
    if (uncountedSlotCodes.length > 0) {
      setIsUncountedWarningShown(true);
      return;
    }
    onSave();
  };

  return (
    <div className="flex flex-col gap-4">
      {afterFace ? (
        <div className="flex gap-1 sm:hidden" role="group" aria-label="Face">
          {(["before", "after"] as const).map((faceSide) => (
            <Button
              key={faceSide}
              size="sm"
              variant={side === faceSide ? "primary" : "secondary"}
              onClick={() => setSide(faceSide)}
            >
              {faceSide === "before" ? "Before" : "After"}
            </Button>
          ))}
        </div>
      ) : null}

      <div className={`grid gap-3 ${afterFace ? "sm:grid-cols-2" : ""}`}>
        <div className={afterFace ? sideClass("before") : ""}>
          <ReviewFace
            title="Before"
            shelves={shelves}
            face={beforeFace}
            nameOf={productName}
          />
        </div>
        {afterFace ? (
          <div className={sideClass("after")}>
            <ReviewFace
              title="After"
              shelves={shelves}
              face={afterFace}
              nameOf={productName}
            />
          </div>
        ) : null}
      </div>

      {afterFace ? (
        <Card className="p-3">
          {changeDescriptions.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-gray-800">
              {changeDescriptions.map((description) => (
                <li key={description}>{description}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">
              No layout changes. Check the After face against your photo.
            </p>
          )}
        </Card>
      ) : null}

      {problemItems.length > 0 ? (
        <Alert tone="warning" title="Fix these before saving">
          <ul className="list-disc pl-5">
            {problemItems.map(([message, problem]) => {
              const slotCode =
                "slotCode" in problem
                  ? problem.slotCode
                  : attentionSlotCodeFor(problem);
              return (
                <li key={message}>
                  {message}
                  {slotCode === null ? null : (
                    <button
                      type="button"
                      className="ml-2 font-bold underline"
                      onClick={() =>
                        onShowSlot({ step: stepFor(problem), slotCode })
                      }
                    >
                      Go to {slotCode}
                    </button>
                  )}
                  {problem.kind === "answered-but-uncounted" ? (
                    <button
                      type="button"
                      className="ml-2 font-bold underline"
                      onClick={() => onClearAnswer(problem)}
                    >
                      Clear answer
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-3 p-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Counted at</span>
          <input
            type="datetime-local"
            className={countInputClass}
            value={countedAtInput}
            onChange={(e) => onCountedAtInputChange(e.target.value)}
          />
          <span className={hintClass}>
            When you stood at the machine — this orders every interval the
            engine computes. Back-date it if you're entering this later.
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Notes</span>
          <textarea
            className={inputClass}
            rows={2}
            placeholder="Jammed coil, cold deck warm, …"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </label>
      </Card>

      {isUncountedWarningShown ? (
        <Alert
          tone="warning"
          title={`${uncountedSlotCodes.length} slot(s) weren't fully counted: ${uncountedSlotCodes.join(", ")}.`}
        >
          <p>
            An uncounted slot gets no line at all, so the engine reports it as
            not counted rather than inventing a sold figure. That's correct —
            but those slots will show no sales for this interval.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={onSave}
              disabled={isSaving || problems.length > 0}
            >
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

      <Button
        full
        onClick={handleSave}
        disabled={isSaving || problems.length > 0 || isUncountedWarningShown}
      >
        {isSaving ? "Saving…" : "Save Visit"}
      </Button>
    </div>
  );
}
