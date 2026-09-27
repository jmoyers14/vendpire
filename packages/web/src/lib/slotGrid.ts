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

/**
 * Reverse-parse existing slot codes into grid rows, or null when they don't
 * fit the pattern (then the form opens in custom mode). Codes fit when every
 * code is one letter + a number, rows are consecutive letters from A, and each
 * row's numbers form an arithmetic sequence (any start, constant step ≥ 1 —
 * a single-slot row defaults to step 1).
 */
export const slotCodesToRows = (codes: string[]): SlotGridRow[] | null => {
  if (codes.length === 0) {
    return null;
  }
  const rows: SlotGridRow[] = [];
  let index = 0;
  while (index < codes.length) {
    const letter = String.fromCharCode(65 + rows.length);
    const numbers: number[] = [];
    while (index < codes.length) {
      const match = codes[index]?.match(/^([A-Z])(\d+)$/);
      if (!match || match[1] !== letter) {
        break;
      }
      numbers.push(Number(match[2]));
      index += 1;
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
 * Flat stored codes → shelves, for rendering any machine's face regardless of
 * how its codes were authored. Consecutive codes sharing a leading-letter
 * prefix form one shelf ("A1 A2 A5" → shelf A even though it fits no
 * arithmetic rule); a code with no letter prefix starts its own shelf.
 */
export const groupSlotCodes = (codes: string[]): string[][] => {
  const groups: string[][] = [];
  let prefix: string | null = null;
  for (const code of codes) {
    const match = code.match(/^[A-Za-z]+/);
    const codePrefix = match ? match[0].toUpperCase() : null;
    if (codePrefix !== null && codePrefix === prefix && groups.length > 0) {
      groups[groups.length - 1]!.push(code);
    } else {
      groups.push([code]);
      prefix = codePrefix;
    }
  }
  return groups;
};
