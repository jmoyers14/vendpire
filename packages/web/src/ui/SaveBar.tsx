import type { ReactNode } from "react";
import { Button } from "./Button.tsx";

type SaveBarWidth = "form" | "wide";

const WIDTH: Record<SaveBarWidth, string> = {
  form: "max-w-form",
  wide: "max-w-wide",
};

/**
 * The sticky footer of an editable page. Render it after the page container so
 * it spans the window; pass `formId` and Save submits that form.
 */
export const SaveBar = ({
  isDirty,
  summary,
  saveLabel,
  dismissal = "discard",
  onDismiss,
  formId,
  onSave,
  isSaving = false,
  isSaveDisabled = false,
  width = "form",
}: {
  isDirty: boolean;
  /** Replaces the saved/unsaved state, e.g. "3 items · $51.97". */
  summary?: ReactNode;
  saveLabel: string;
  /**
   * "discard" reverts edits and is disabled on a clean form (edit pages).
   * "cancel" leaves the page and always works (create pages).
   */
  dismissal?: "discard" | "cancel";
  onDismiss: () => void;
  formId?: string;
  onSave?: () => void;
  isSaving?: boolean;
  /** On top of the built-in rule that a clean form has nothing to save. */
  isSaveDisabled?: boolean;
  width?: SaveBarWidth;
}) => (
  <div className="sticky bottom-0 z-10 border-t border-line bg-card">
    <div
      className={`mx-auto flex ${WIDTH[width]} items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-10`}
    >
      <div
        className="flex min-w-0 items-center gap-2 text-button font-normal text-muted-strong"
        aria-live="polite"
      >
        {summary ?? <SaveState isDirty={isDirty} />}
      </div>
      <div className="flex flex-none gap-2">
        <Button
          variant="secondary"
          onClick={onDismiss}
          disabled={isSaving || (dismissal === "discard" && !isDirty)}
        >
          {dismissal === "discard" ? "Discard" : "Cancel"}
        </Button>
        <Button
          type={formId ? "submit" : "button"}
          form={formId}
          onClick={onSave}
          disabled={!isDirty || isSaveDisabled || isSaving}
        >
          {isSaving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  </div>
);

const SaveState = ({ isDirty }: { isDirty: boolean }) => (
  <>
    <span
      aria-hidden
      className={`size-2 flex-none rounded-full ${isDirty ? "bg-warning-indicator" : "bg-success-indicator"}`}
    />
    {isDirty ? "Unsaved changes" : "All changes saved"}
  </>
);
