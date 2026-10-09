import type { ReactNode } from "react";
import { focusRing } from "./focus.ts";

/**
 * The machine face as a grid: one strip of cells per shelf, cells spanning
 * equal width. Every screen that shows a machine layout renders through this —
 * the machine form (bare codes), the planogram screen (product and price), and
 * the visit screens (counts) — so a slot looks and behaves the same wherever
 * it appears.
 *
 * Consumers supply a cell's CONTENT and STATE; the grid owns all the chrome,
 * including selection. That split is what keeps the three screens visually
 * identical as they drift apart in function.
 */

/**
 * What a cell says about itself, as meaning rather than color. `done` and
 * `attention` use the status palette (green/amber) because they ARE status;
 * selection uses primary, because it's an interaction.
 */
export type SlotCellState = "assigned" | "empty" | "done" | "attention";

export interface SlotCell {
  content: ReactNode;
  state?: SlotCellState;
  /** Native tooltip, for the detail that doesn't fit in the cell. */
  title?: string;
}

const CELL_STATE: Record<SlotCellState, string> = {
  assigned: "border-line bg-card hover:border-primary-300",
  empty: "border-dashed border-gray-300 bg-gray-50 hover:border-primary-300",
  done: "border-green-300 bg-green-50 hover:border-green-400",
  attention: "border-amber-300 bg-amber-50 hover:border-amber-400",
};

const SELECTED_CELL = "border-primary-500 bg-card ring-2 ring-primary-300";

/** Bare slot code — what a layout with nothing assigned to it yet shows. */
const slotCodeCell = (slotCode: string): SlotCell => ({
  content: <span className="font-mono text-xs text-body">{slotCode}</span>,
  state: "assigned",
});

export interface SlotFaceGridProps {
  shelves: string[][];
  /** Defaults to the bare slot code. */
  renderCell?: (slotCode: string) => SlotCell;
  /** Set to make cells selectable; cells become buttons only when present. */
  onSelect?: (slotCode: string) => void;
  selectedCode?: string | null;
}

export function SlotFaceGrid({
  shelves,
  renderCell = slotCodeCell,
  onSelect,
  selectedCode = null,
}: SlotFaceGridProps) {
  if (shelves.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1.5 overflow-x-auto rounded-md bg-gray-100 p-2">
      {shelves.map((shelf, shelfIndex) => (
        // Shelves have no identity of their own — position IS the shelf.
        <div key={shelfIndex} className="flex gap-1">
          {shelf.map((slotCode, cellIndex) => {
            const cell = renderCell(slotCode);
            // A cell floor rather than a pure fraction: on a phone a wide
            // shelf scrolls the container instead of crushing 8 cells to
            // unreadable slivers.
            const chrome = `min-w-14 flex-1 rounded border px-1 py-1.5 text-center ${
              selectedCode === slotCode
                ? SELECTED_CELL
                : CELL_STATE[cell.state ?? "assigned"]
            }`;
            // Duplicate codes are a layout the user authored, not a crash —
            // fall back to position so React still gets a stable key.
            const key = `${slotCode}-${cellIndex}`;

            if (!onSelect) {
              return (
                <div key={key} title={cell.title} className={chrome}>
                  {cell.content}
                </div>
              );
            }
            return (
              <button
                type="button"
                key={key}
                title={cell.title}
                onClick={() => onSelect(slotCode)}
                className={`${chrome} transition-shadow ${focusRing}`}
              >
                {cell.content}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
