/**
 * Slot-code normalization, shared by machines and machine templates: codes are
 * trimmed and uppercased, empty codes and empty shelves drop out, and codes
 * that repeat anywhere on the face are reported back.
 *
 * Duplicates are returned rather than thrown because this package carries no
 * dependencies and must stay runnable in the browser — it can't reach for the
 * api package's ServiceError, and a plain Error would surface to the client as
 * a 500 instead of a 400.
 */

export interface NormalizedSlots {
  /** One array per shelf, codes in walking order — the shape that gets stored. */
  slots: string[][];
  /** Codes seen more than once across the whole face, in first-seen order. */
  duplicates: string[];
}

export const normalizeSlots = (slots: string[][]): NormalizedSlots => {
  const normalized = slots
    .map((shelf) =>
      shelf.map((code) => code.trim().toUpperCase()).filter(Boolean),
    )
    .filter((shelf) => shelf.length > 0);

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const code of normalized.flat()) {
    if (!seen.has(code)) {
      seen.add(code);
      continue;
    }
    if (!duplicates.includes(code)) {
      duplicates.push(code);
    }
  }

  return { slots: normalized, duplicates };
};
