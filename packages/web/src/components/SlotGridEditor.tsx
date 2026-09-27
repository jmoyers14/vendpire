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
 * Describe the machine's slot grid instead of typing every code: row count ×
 * default columns, then per-row width tweaks (drink rows are often wider
 * slots, so fewer columns). Shows the generated codes live.
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

  const setRowColumns = (index: number, columns: number) => {
    onChange(
      rows.map((row, i) =>
        i === index ? { ...row, columns: clamp(columns, 1, 20) } : row,
      ),
    );
  };

  return (
    <div className="space-y-3 rounded border border-grey-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-grey-700">
          Rows (shelves)
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
          Slots per row
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

      <div className="space-y-1">
        {rows.map((row, index) => (
          <div key={row.letter} className="flex items-center gap-2 text-sm">
            <span className="w-6 font-mono font-medium text-grey-800">
              {row.letter}
            </span>
            <input
              type="number"
              min={1}
              max={20}
              className="w-20 rounded border border-grey-300 px-2 py-1 text-sm"
              value={row.columns}
              onChange={(e) => setRowColumns(index, Number(e.target.value) || 1)}
            />
            <span className="font-mono text-xs text-grey-500">
              {row.letter}1–{row.letter}
              {row.columns}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-grey-500">
        {rowsToSlotCodes(rows).length} slots: {rowsToSlotCodes(rows).join(", ")}
      </p>
    </div>
  );
}
