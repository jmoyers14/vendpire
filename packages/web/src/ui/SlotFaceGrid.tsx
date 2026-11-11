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
  content: <span className="font-mono text-xs text-ink-soft">{slotCode}</span>,
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

/**
 * A cell listing a slot's products front to back, with a count badge when the
 * slot is mixed. Shared so a mixed slot looks the same on every screen.
 */
export const buildProductsCell = ({
  slotCode,
  products,
  detail = null,
  state,
  title,
  emptyLabel = "—",
}: {
  slotCode: string;
  products: { id: string; name: string }[];
  detail?: string | null;
  /** Defaults to assigned, or empty when there are no products. */
  state?: SlotCellState;
  /** Defaults to the products in order, then the detail. */
  title?: string;
  emptyLabel?: string;
}): SlotCell => {
  const names = products.map((product) => product.name);
  return {
    state: state ?? (products.length > 0 ? "assigned" : "empty"),
    title:
      title ??
      (products.length > 0
        ? `${slotCode}: ${names.join(", then ")}${detail ? ` — ${detail}` : ""}`
        : `${slotCode}: empty`),
    content: (
      <>
        <div className="font-mono text-[10px] text-muted">
          {slotCode}
          {products.length > 1 ? (
            <span className="ml-1 rounded bg-primary-50 px-1 text-primary-700">
              {products.length}
            </span>
          ) : null}
        </div>
        {products.length === 0 ? (
          <div className="text-[10px] text-gray-400">{emptyLabel}</div>
        ) : null}
        {products.map((product, index) => (
          <div
            key={product.id}
            className={`truncate text-[11px] ${
              index === 0 ? "font-medium text-gray-800" : "text-gray-600"
            }`}
          >
            {product.name}
          </div>
        ))}
        {detail ? (
          <div className="text-[10px] tabular-nums text-gray-600">{detail}</div>
        ) : null}
      </>
    ),
  };
};

/** "Front" or "Behind" in a mixed slot; nothing for a slot with one product. */
export const slotPositionLabel = ({
  index,
  count,
}: {
  index: number;
  count: number;
}): string => {
  if (count === 1) {
    return "";
  }
  return index === 0 ? "Front" : "Behind";
};
