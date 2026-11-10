import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  countInputClass,
  hintClass,
  inputClass,
  labelClass,
} from "../../ui.tsx";
import {
  problemMessage,
  type buildVisitSubmission,
} from "./visitSubmission.ts";

type VisitSubmissionResult = ReturnType<typeof buildVisitSubmission>;

/** The last step: what will be saved, anything blocking it, and Save. */
export function VisitReview({
  submissionResult,
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
  const problems =
    "problems" in submissionResult ? submissionResult.problems : [];
  // A mixed slot can report the same problem once per product.
  const problemMessages = [
    ...new Set(problems.map((problem) => problemMessage(problem, productName))),
  ];

  const handleSave = () => {
    if (uncountedSlotCodes.length > 0) {
      setIsUncountedWarningShown(true);
      return;
    }
    onSave();
  };

  return (
    <div className="flex flex-col gap-4">
      {problemMessages.length > 0 ? (
        <Alert tone="warning" title="Fix these before saving">
          <ul className="list-disc pl-5">
            {problemMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
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
            <Button size="sm" onClick={onSave} disabled={isSaving}>
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
