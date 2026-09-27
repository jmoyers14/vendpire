import { useState } from "react";
import { inputClass } from "./ui.tsx";
import {
  buildRows,
  MAX_ROWS,
  rowsToSlotCodes,
  slotLabel,
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
  const [showNumbering, setShowNumbering] = useState(
    rows.some((row) => row.start !== 1 || row.step !== 1),
  );

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

  const setRowNumbering = (
    index: number,
    patch: Partial<Pick<SlotGridRow, "start" | "step">>,
  ) => {
    onChange(
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              ...patch,
              start: clamp(patch.start ?? row.start, 0, 99),
              step: clamp(patch.step ?? row.step, 1, 9),
            }
          : row,
      ),
    );
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
      <div className="flex items-end gap-2">
        <label className="flex-1 text-sm text-grey-700">
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
        <label className="flex-1 text-sm text-grey-700">
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
        <button
          type="button"
          onClick={() => setShowNumbering(!showNumbering)}
          className="mb-1 whitespace-nowrap text-xs text-primary-600 hover:text-primary-500"
          title="Some machines number by motor position — e.g. evens only (A0, A2, A4…). Set each shelf's first number and the gap between numbers."
        >
          {showNumbering ? "Hide numbering" : "Numbering…"}
        </button>
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
                  {slotLabel(row, i)}
                </div>
              ))}
            </div>
            {showNumbering ? (
              <div className="flex shrink-0 items-center gap-1 text-xs text-grey-500">
                <label title={`Row ${row.letter}: first slot number`}>
                  start
                  <input
                    type="number"
                    min={0}
                    max={99}
                    className="ml-0.5 w-11 rounded border border-grey-300 px-1 py-0.5"
                    value={row.start}
                    onChange={(e) =>
                      setRowNumbering(index, { start: Number(e.target.value) })
                    }
                  />
                </label>
                <label title={`Row ${row.letter}: gap between slot numbers`}>
                  step
                  <input
                    type="number"
                    min={1}
                    max={9}
                    className="ml-0.5 w-9 rounded border border-grey-300 px-1 py-0.5"
                    value={row.step}
                    onChange={(e) =>
                      setRowNumbering(index, { step: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
            ) : null}
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
        {rowsToSlotCodes(rows).length} slots total. Combo machine? − the drink
        shelf down to 5–6. Even-numbered machine (A0, A2, A4…)? Numbering… →
        start 0, step 2.
      </p>
    </div>
  );
}
