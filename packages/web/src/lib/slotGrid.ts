/**
 * Slot-code grid helpers. Vending machines label slots as letter row + number
 * column (A1..F8), so the machine form lets you describe the grid instead of
 * typing every code. Rows can differ in width (drink rows are often wider
 * slots, so fewer columns).
 */

export interface SlotGridRow {
  /** Row letter, "A".."Z". */
  letter: string;
  /** Number of slots in this row. */
  columns: number;
}

export const MAX_ROWS = 26;

/** Rows for a fresh grid: `rowCount` rows of `columns` each. */
export const buildRows = (rowCount: number, columns: number): SlotGridRow[] =>
  Array.from({ length: Math.min(rowCount, MAX_ROWS) }, (_, i) => ({
    letter: String.fromCharCode(65 + i),
    columns,
  }));

/** Expand grid rows into slot codes in walking order (A1..A8, B1..B8, …). */
export const rowsToSlotCodes = (rows: SlotGridRow[]): string[] =>
  rows.flatMap((row) =>
    Array.from({ length: row.columns }, (_, i) => `${row.letter}${i + 1}`),
  );

/**
 * Reverse-parse existing slot codes into grid rows, or null when they don't
 * fit the letter+number pattern (then the form opens in custom mode). Codes
 * fit when every code is one letter + a number, rows are consecutive letters
 * from A, and each row's numbers are exactly 1..N in order.
 */
export const slotCodesToRows = (codes: string[]): SlotGridRow[] | null => {
  if (codes.length === 0) {
    return null;
  }
  const rows: SlotGridRow[] = [];
  let index = 0;
  while (index < codes.length) {
    const letter = String.fromCharCode(65 + rows.length);
    let columns = 0;
    while (index < codes.length && codes[index] === `${letter}${columns + 1}`) {
      columns += 1;
      index += 1;
    }
    if (columns === 0) {
      return null;
    }
    rows.push({ letter, columns });
  }
  return rows;
};
