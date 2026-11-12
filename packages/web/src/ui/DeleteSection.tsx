import { useEffect, useRef, useState } from "react";
import { ErrorNote } from "./Alert.tsx";
import { Button } from "./Button.tsx";
import { FormSection } from "./FormSection.tsx";

/**
 * The last section of an edit page: delete the record, asking first because
 * the button shares a page with Save. The server's refusal ("still in a
 * machine") shows here as `error`.
 */
export const DeleteSection = ({
  recordKind,
  recordName,
  description,
  isDeleting,
  error,
  onDelete,
  onDismiss,
}: {
  /** "product", "location": names the buttons. */
  recordKind: string;
  recordName: string;
  description: string;
  isDeleting: boolean;
  error: string | null;
  onDelete: () => void;
  /** Clears a refusal when the operator backs out. */
  onDismiss: () => void;
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const hasToggledRef = useRef(false);
  // The button pressed is swapped out, so focus moves to the last new one:
  // "Keep it" when asking, so a second Enter can't delete.
  useEffect(() => {
    if (!hasToggledRef.current) {
      return;
    }
    const buttons = controlsRef.current?.querySelectorAll("button");
    buttons?.[buttons.length - 1]?.focus();
  }, [isConfirming]);
  const toggleConfirming = (next: boolean) => {
    hasToggledRef.current = true;
    setIsConfirming(next);
  };

  return (
    <FormSection title="Delete" description={description}>
      {isConfirming ? (
        <div className="grid gap-4">
          <p className="text-body text-ink">
            Delete <strong>{recordName}</strong>? This can't be undone.
          </p>
          <div ref={controlsRef} className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={onDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : `Delete ${recordKind}`}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                toggleConfirming(false);
                onDismiss();
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div ref={controlsRef}>
          <Button variant="danger" onClick={() => toggleConfirming(true)}>
            Delete {recordKind}…
          </Button>
        </div>
      )}
      <ErrorNote message={error} />
    </FormSection>
  );
};
