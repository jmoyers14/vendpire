/**
 * Slot-code grid helpers. Vending machines label slots as letter row + number
 * column, so the machine form lets you describe the grid instead of typing
 * every code. Rows can differ in width (drink rows are often wider slots, so
 * fewer columns) AND in numbering: some machines number by motor position and
 * only expose evens (A0, A2, A4…), so each row carries a start + step rule.
 */

export interface SlotGridRow {
  /** Row letter, "A".."Z". */
  letter: string;
  /** Number of slots in this row. */
  columns: number;
  /** First slot number (usually 1; even-numbered machines start at 0). */
  start: number;
  /** Gap between slot numbers (usually 1; even-numbered machines use 2). */
  step: number;
}

export const MAX_ROWS = 26;

/** Rows for a fresh grid: `rowCount` rows of `columns` each, numbered 1,2,3… */
export const buildRows = (rowCount: number, columns: number): SlotGridRow[] =>
  Array.from({ length: Math.min(rowCount, MAX_ROWS) }, (_, i) => ({
    letter: String.fromCharCode(65 + i),
    columns,
    start: 1,
    step: 1,
  }));

/** The label of the i-th (0-based) slot in a row. */
export const slotLabel = (row: SlotGridRow, i: number): string =>
  `${row.letter}${row.start + i * row.step}`;

/** Expand grid rows into slot codes in walking order (A1..A8, B1..B8, …). */
export const rowsToSlotCodes = (rows: SlotGridRow[]): string[] =>
  rows.flatMap((row) =>
    Array.from({ length: row.columns }, (_, i) => slotLabel(row, i)),
  );

/** Grid rows → stored shelves (one array of codes per shelf). */
export const rowsToShelves = (rows: SlotGridRow[]): string[][] =>
  rows.map((row) =>
    Array.from({ length: row.columns }, (_, i) => slotLabel(row, i)),
  );

/**
 * Reverse-parse stored shelves into grid rows, or null when they don't fit
 * the pattern (then the form opens in custom mode). Shelves fit when they are
 * lettered A, B, C… in order and each shelf's numbers form an arithmetic
 * sequence (any start, constant step ≥ 1 — a single-slot shelf defaults to
 * step 1).
 */
export const shelvesToRows = (shelves: string[][]): SlotGridRow[] | null => {
  if (shelves.length === 0) {
    return null;
  }
  const rows: SlotGridRow[] = [];
  for (const [index, shelf] of shelves.entries()) {
    const letter = String.fromCharCode(65 + index);
    const numbers: number[] = [];
    for (const code of shelf) {
      const match = code.match(/^([A-Z])(\d+)$/);
      if (!match || match[1] !== letter) {
        return null;
      }
      numbers.push(Number(match[2]));
    }
    if (numbers.length === 0) {
      return null;
    }
    const start = numbers[0]!;
    const step = numbers.length > 1 ? numbers[1]! - start : 1;
    if (step < 1) {
      return null;
    }
    const arithmetic = numbers.every((n, i) => n === start + i * step);
    if (!arithmetic) {
      return null;
    }
    rows.push({ letter, columns: numbers.length, start, step });
  }
  return rows;
};

/**
 * Manual-entry text → shelves: one line per shelf, codes separated by spaces
 * or commas. Empty lines are ignored.
 */
export const parseSlotLines = (text: string): string[][] =>
  text
    .split(/\n/)
    .map((line) =>
      line
        .split(/[\s,]+/)
        .map((code) => code.trim())
        .filter(Boolean),
    )
    .filter((line) => line.length > 0);

/**
 * The slots half of a machine/template form: the editor mode plus both
 * representations, since switching modes has to carry the layout across.
 */
export interface SlotsValue {
  mode: "grid" | "custom";
  rows: SlotGridRow[];
  codesText: string;
}

/** Default grid for a form with nothing to prefill: 6 shelves of 8. */
export const emptySlotsValue = (): SlotsValue => ({
  mode: "grid",
  rows: buildRows(6, 8),
  codesText: "",
});

/** What gets persisted, from whichever mode the form is in. */
export const slotsValueToShelves = (value: SlotsValue): string[][] =>
  value.mode === "grid"
    ? rowsToShelves(value.rows)
    : parseSlotLines(value.codesText);

/**
 * Stored shelves → form state. Opens in grid mode when the shelves reverse-
 * parse and custom mode when they don't, and always fills BOTH
 * representations so flipping the mode toggle never loses the layout.
 */
export const shelvesToSlotsValue = (shelves: string[][]): SlotsValue => {
  const rows = shelvesToRows(shelves);
  return {
    mode: rows ? "grid" : "custom",
    rows: rows ?? buildRows(6, 8),
    codesText: shelves.map((shelf) => shelf.join(" ")).join("\n"),
  };
};

/** Carry the layout across a mode flip, keeping the other mode's text/rows. */
export const toggleSlotsMode = (value: SlotsValue): SlotsValue =>
  value.mode === "grid"
    ? {
        mode: "custom",
        rows: value.rows,
        codesText: rowsToShelves(value.rows)
          .map((shelf) => shelf.join(" "))
          .join("\n"),
      }
    : {
        mode: "grid",
        rows: shelvesToRows(parseSlotLines(value.codesText)) ?? value.rows,
        codesText: value.codesText,
      };
