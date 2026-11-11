import { useCallback, useState } from "react";
import { isSameDraft } from "./draftEquality.ts";

/**
 * A form's working copy plus the saved version it started from, so a SaveBar
 * can tell whether anything changed. `load` replaces both, for when the record
 * arrives from the server; `discard` throws away edits.
 */
export const useFormDraft = <T extends object>(initial: T) => {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);

  const set = useCallback(
    (patch: Partial<T>) => setDraft((current) => ({ ...current, ...patch })),
    [],
  );
  const load = useCallback((next: T) => {
    setSaved(next);
    setDraft(next);
  }, []);
  const discard = useCallback(() => setDraft(saved), [saved]);

  return {
    draft,
    set,
    load,
    discard,
    isDirty: !isSameDraft(draft, saved),
  };
};
