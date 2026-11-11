// Every interactive element shares one focus treatment so keyboard users get a
// consistent target. Design system rule: 2px focus ring, offset 2px.
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** The same ring drawn inside the element, for rows in a scrolling list where an outside ring is clipped. */
export const insetFocusRing =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";
