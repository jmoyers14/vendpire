import { useState } from "react";
import { inputClass } from "./ui.tsx";
import {
  buildRows,
  MAX_ROWS,
  rowsToSlotCodes,
  type SlotGridRow,
} from "../lib/slotGrid.ts";

interface SlotGridEditorProps {
  rows: SlotGridRow[];
  onChange: (rows: SlotGridRow[]) => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Visual editor for the machine's slot grid, drawn like the machine face: one
 * strip of cells per shelf, each cell labeled with its code. Every row spans
 * the same total width, so a shelf with fewer slots shows fewer, WIDER cells —
 * exactly how a drink row looks under the snack rows on a combo machine.
 * The +/− at a row's edge changes that shelf's slot count.
 */
export function SlotGridEditor({ rows, onChange }: SlotGridEditorProps) {
  const [defaultColumns, setDefaultColumns] = useState(rows[0]?.columns ?? 8);

  const setRowCount = (count: number) => {
    const next = buildRows(clamp(count, 1, MAX_ROWS), defaultColumns).map(
      // Keep the widths of rows that already exist; new rows get the default.
      (row, i) => rows[i] ?? row,
    );
    onChange(next);
  };

  const setDefault = (columns: number) => {
    const width = clamp(columns, 1, 20);
    setDefaultColumns(width);
    onChange(rows.map((row) => ({ ...row, columns: width })));
  };

  const bumpRow = (index: number, delta: number) => {
    onChange(
      rows.map((row, i) =>
        i === index
          ? { ...row, columns: clamp(row.columns + delta, 1, 20) }
          : row,
      ),
    );
  };

  return (
    <div className="space-y-3 rounded border border-grey-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-grey-700">
          Shelves
          <input
            type="number"
            min={1}
            max={MAX_ROWS}
            className={inputClass}
            value={rows.length}
            onChange={(e) => setRowCount(Number(e.target.value) || 1)}
          />
        </label>
        <label className="text-sm text-grey-700">
          Slots per shelf (default)
          <input
            type="number"
            min={1}
            max={20}
            className={inputClass}
            value={defaultColumns}
            onChange={(e) => setDefault(Number(e.target.value) || 1)}
          />
        </label>
      </div>

      {/* The machine face. */}
      <div className="space-y-1.5 rounded-md bg-grey-100 p-2">
        {rows.map((row, index) => (
          <div key={row.letter} className="flex items-center gap-1.5">
            <div className="flex flex-1 gap-1">
              {Array.from({ length: row.columns }, (_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded border border-grey-300 bg-white py-1.5 text-center font-mono text-xs text-grey-700"
                >
                  {row.letter}
                  {i + 1}
                </div>
              ))}
            </div>
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                onClick={() => bumpRow(index, -1)}
                disabled={row.columns <= 1}
                title={`Remove a slot from row ${row.letter}`}
                className="h-6 w-6 rounded border border-grey-300 bg-white text-xs text-grey-600 hover:bg-grey-50 disabled:opacity-30"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => bumpRow(index, 1)}
                disabled={row.columns >= 20}
                title={`Add a slot to row ${row.letter}`}
                className="h-6 w-6 rounded border border-grey-300 bg-white text-xs text-grey-600 hover:bg-grey-50 disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-grey-500">
        {rowsToSlotCodes(rows).length} slots total — e.g. a combo machine:
        snack shelves at 8, then − the drink shelf down to 5 or 6.
      </p>
    </div>
  );
}
