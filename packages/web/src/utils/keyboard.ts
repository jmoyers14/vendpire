import type { KeyboardEvent } from "react";

/** A keydown handler that runs `action` on Enter instead of submitting. */
export const onEnterKey =
  (action: () => void) =>
  (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    action();
  };
