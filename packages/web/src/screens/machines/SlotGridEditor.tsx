import { type FocusEvent, useRef, useState } from "react";
import {
  Button,
  Field,
  FieldRow,
  NumberInput,
  RowTable,
  RowTableBody,
  RowTableHeader,
  RowTableRow,
} from "../../ui.tsx";
import { buildRows, MAX_ROWS, type SlotGridRow, slotLabel } from "./slotGrid.ts";

const MAX_SLOTS_PER_SHELF = 20;
const DEFAULT_SLOTS_PER_SHELF = 8;
/** Highest first slot number on a shelf. */
const MAX_FIRST_NUMBER = 99;
/** Widest gap between slot numbers. */
const MAX_NUMBER_STEP = 9;

/** Shelf · Slots · First number · Step. */
const SHELF_COLUMNS = "56px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

// Typing replaces the number instead of appending to it, since a cleared box snaps to 1.
const selectOnFocus = (event: FocusEvent<HTMLInputElement>) => event.target.select();

/**
 * The grid controls above the layout map: shelf count and a default width for
 * every shelf, then shelf-by-shelf widths and numbering for machines that
 * don't follow the pattern (a narrower drink shelf, evens-only A0, A2, A4…).
 */
export function SlotGridEditor({
  rows,
  onChange,
}: {
  rows: SlotGridRow[];
  onChange: (rows: SlotGridRow[]) => void;
}) {
  const [defaultColumns, setDefaultColumns] = useState(rows[0]?.columns ?? DEFAULT_SLOTS_PER_SHELF);
  const [isShowingShelves, setIsShowingShelves] = useState(
    rows.some(
      (row) => row.start !== 1 || row.step !== 1 || row.columns !== rows[0]?.columns,
    ),
  );

  // Shelves dropped while typing a count ("6" → "1" → "12") come back as they were.
  const droppedRowsRef = useRef<SlotGridRow[]>([]);

  const setRowCount = (count: number) => {
    const remembered = rows.length >= droppedRowsRef.current.length ? rows : [
      ...rows,
      ...droppedRowsRef.current.slice(rows.length),
    ];
    droppedRowsRef.current = remembered;
    const next = buildRows(clamp(count, 1, MAX_ROWS), defaultColumns).map(
      (row, index) => remembered[index] ?? row,
    );
    onChange(next);
  };

  const setDefault = (columns: number) => {
    const width = clamp(columns, 1, MAX_SLOTS_PER_SHELF);
    setDefaultColumns(width);
    // A new width for every shelf replaces the ones remembered from dropped shelves too.
    droppedRowsRef.current = [];
    onChange(rows.map((row) => ({ ...row, columns: width })));
  };

  const setRow = (
    index: number,
    patch: Partial<Pick<SlotGridRow, "columns" | "start" | "step">>,
  ) => {
    onChange(
      rows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              columns: clamp(patch.columns ?? row.columns, 1, MAX_SLOTS_PER_SHELF),
              start: clamp(patch.start ?? row.start, 0, MAX_FIRST_NUMBER),
              step: clamp(patch.step ?? row.step, 1, MAX_NUMBER_STEP),
            }
          : row,
      ),
    );
  };

  return (
    <div className="grid gap-4">
      <FieldRow>
        <Field label="Shelves">
          <NumberInput
            size="sm"
            value={rows.length}
            onFocus={selectOnFocus}
            onChange={(event) => setRowCount(Number(event.target.value) || 1)}
          />
        </Field>
        <Field label="Slots per shelf" hint="Sets every shelf at once.">
          <NumberInput
            size="sm"
            value={defaultColumns}
            onFocus={selectOnFocus}
            onChange={(event) => setDefault(Number(event.target.value) || 1)}
          />
        </Field>
      </FieldRow>

      <div>
        <Button
          variant="text"
          size="sm"
          aria-expanded={isShowingShelves}
          onClick={() => setIsShowingShelves(!isShowingShelves)}
        >
          {isShowingShelves ? "Hide shelf by shelf" : "Adjust shelf by shelf…"}
        </Button>
        <p className="mt-1 text-body-sm text-muted-strong">
          For a narrower drink shelf, or a machine numbered by motor (A0, A2, A4…: first number
          0, step 2).
        </p>
      </div>

      {isShowingShelves ? (
        <RowTable columns={SHELF_COLUMNS} minWidth="360px">
          <RowTableHeader>
            <span>Shelf</span>
            <span>Slots</span>
            <span>First number</span>
            <span>Step</span>
          </RowTableHeader>
          <RowTableBody>
            {rows.map((row, index) => (
              <RowTableRow key={row.letter}>
                <span className="font-mono text-label text-ink">
                  {row.letter}
                  <span className="sr-only">
                    {" "}
                    ({slotLabel(row, 0)} to {slotLabel(row, row.columns - 1)})
                  </span>
                </span>
                <NumberInput
                  size="sm"
                  aria-label={`Shelf ${row.letter} slots`}
                  value={row.columns}
                  onFocus={selectOnFocus}
                  onChange={(event) => setRow(index, { columns: Number(event.target.value) || 1 })}
                />
                <NumberInput
                  size="sm"
                  aria-label={`Shelf ${row.letter} first number`}
                  value={row.start}
                  onFocus={selectOnFocus}
                  onChange={(event) => setRow(index, { start: Number(event.target.value) || 0 })}
                />
                <NumberInput
                  size="sm"
                  aria-label={`Shelf ${row.letter} step`}
                  value={row.step}
                  onFocus={selectOnFocus}
                  onChange={(event) => setRow(index, { step: Number(event.target.value) || 1 })}
                />
              </RowTableRow>
            ))}
          </RowTableBody>
        </RowTable>
      ) : null}
    </div>
  );
}
