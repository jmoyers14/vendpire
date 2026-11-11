import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import { focusRing } from "./focus.ts";
import { isSlotMatch, shelfLabel } from "./machineMap.ts";
import { controlClass } from "./TextInput.tsx";

/**
 * How a tile's value reads. `pending` is "not answered yet"; `low`, `out` and
 * `done` are status and use the status palette.
 */
export type MachineTileTone = "neutral" | "pending" | "low" | "out" | "done";

export interface MachineTile {
  /** The middle line: a count, "+3", "→B2", "$1.75", or "—". */
  value: ReactNode;
  tone?: MachineTileTone;
  /** 0–1 fill along the bottom edge. Leave out to hide the meter. */
  meter?: number;
  /** More than one shows the ×N marker. */
  productCount?: number;
  /** A slot with nothing planned in it. */
  isEmpty?: boolean;
  /** A slot you can drop a move or swap onto. */
  isTarget?: boolean;
  /** The slot a move or swap starts from. */
  isSource?: boolean;
  /** Accessible name and tooltip: code, product names, status. */
  label: string;
  /** What the map search matches besides the code, e.g. product names. */
  searchText?: string;
}

const VALUE_TONE: Record<MachineTileTone, string> = {
  neutral: "font-bold text-ink",
  pending: "font-medium text-muted-strong",
  low: "font-bold text-warning",
  out: "font-bold text-danger",
  done: "font-bold text-success",
};

const tileClass = ({
  tile,
  isSelected,
  isDimmed,
}: {
  tile: MachineTile;
  isSelected: boolean;
  isDimmed: boolean;
}): string => {
  const chrome = (() => {
    if (tile.isTarget) {
      return "border-2 border-dashed border-action bg-card px-[5px] pt-1 pb-[7px] hover:bg-action-soft";
    }
    if (isSelected) {
      return "border border-action bg-action-soft px-1.5 pt-[5px] pb-2 ring-1 ring-action ring-inset";
    }
    if (tile.isEmpty) {
      return "border border-dashed border-line-strong bg-app px-1.5 pt-[5px] pb-2";
    }
    return "border border-line bg-card px-1.5 pt-[5px] pb-2 hover:border-field";
  })();
  const opacity = isDimmed ? "opacity-25" : tile.isSource ? "opacity-45" : "";
  return `relative flex h-14 min-w-11 flex-1 basis-0 flex-col items-start justify-between overflow-hidden rounded-lg text-left ${chrome} ${opacity}`;
};

const TileFace = ({ slotCode, tile }: { slotCode: string; tile: MachineTile }) => {
  const isOut = tile.tone === "out";
  const fillTone = tile.tone === "low" ? "bg-warning-indicator" : "bg-success-indicator";
  return (
    <>
      <span className="flex w-full items-center justify-between gap-0.5">
        <span className="font-mono text-[11px] leading-[14px] font-medium text-muted-strong">
          {slotCode}
        </span>
        {(tile.productCount ?? 0) > 1 ? (
          <span className="rounded bg-action-soft px-[3px] font-mono text-[10px] leading-[14px] font-bold text-link">
            ×{tile.productCount}
          </span>
        ) : null}
      </span>
      <span
        className={`max-w-full truncate font-mono text-sm leading-[18px] tabular-nums ${VALUE_TONE[tile.tone ?? "neutral"]}`}
      >
        {tile.value}
      </span>
      {tile.meter === undefined ? null : (
        <span
          aria-hidden
          className={`absolute inset-x-0 bottom-0 h-1 ${isOut ? "bg-danger-indicator" : "bg-divider"}`}
        >
          <span
            className={`block h-full ${fillTone}`}
            style={{ width: `${Math.max(0, Math.min(1, tile.meter)) * 100}%` }}
          />
        </span>
      )}
    </>
  );
};

/**
 * The machine as you see it standing in front of it: one row per shelf, tiles
 * sharing the row's width so a 5-slot shelf gets wide tiles and a 9-slot shelf
 * narrow ones. Tiles are buttons when `onSelect` is set.
 *
 * With `search`, a "go to slot or product" box sits above: typing dims the
 * tiles that don't match, Enter selects the first match, Esc clears.
 */
export const MachineMap = ({
  shelves,
  tileFor,
  selectedCode = null,
  onSelect,
  search,
}: {
  shelves: string[][];
  tileFor: (slotCode: string) => MachineTile;
  selectedCode?: string | null;
  onSelect?: (slotCode: string) => void;
  search?: { label: string; placeholder: string };
}) => {
  const [query, setQuery] = useState("");
  const slotCodes = useMemo(
    () => new Set(shelves.flat().map((code) => code.toUpperCase())),
    [shelves],
  );

  if (shelves.length === 0) {
    return null;
  }

  const hasQuery = query.trim() !== "";
  const isMatch = (slotCode: string, tile: MachineTile) =>
    !hasQuery ||
    isSlotMatch({ slotCode, searchText: tile.searchText ?? "", query, slotCodes });

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setQuery("");
      return;
    }
    if (event.key !== "Enter" || !onSelect) {
      return;
    }
    event.preventDefault();
    const firstMatch = shelves
      .flat()
      .find((slotCode) => isMatch(slotCode, tileFor(slotCode)));
    if (firstMatch) {
      onSelect(firstMatch);
      setQuery("");
    }
  };

  return (
    <div className="grid gap-3">
      {search ? (
        <input
          type="search"
          aria-label={search.label}
          placeholder={search.placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          autoComplete="off"
          className={`${controlClass} h-11 px-4 text-button font-normal`}
        />
      ) : null}
      <div className="flex flex-col gap-1.5 overflow-x-auto">
        {shelves.map((shelf, shelfIndex) => (
          // Shelves have no identity of their own — position IS the shelf.
          <div key={shelfIndex} className="flex items-stretch gap-1">
            <span
              aria-hidden
              className="flex w-[18px] flex-none items-center justify-center font-mono text-xs font-bold text-muted-strong"
            >
              {shelfLabel(shelf, shelfIndex)}
            </span>
            {shelf.map((slotCode, slotIndex) => {
              const tile = tileFor(slotCode);
              const className = tileClass({
                tile,
                isSelected: slotCode === selectedCode,
                isDimmed: !isMatch(slotCode, tile),
              });
              // Duplicate codes are a layout the user authored, not a crash.
              const key = `${slotCode}-${slotIndex}`;
              if (!onSelect) {
                return (
                  <div
                    key={key}
                    role="img"
                    aria-label={tile.label}
                    title={tile.label}
                    className={className}
                  >
                    <TileFace slotCode={slotCode} tile={tile} />
                  </div>
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={tile.label}
                  aria-pressed={slotCode === selectedCode}
                  title={tile.label}
                  onClick={() => onSelect(slotCode)}
                  className={`${className} cursor-pointer ${focusRing}`}
                >
                  <TileFace slotCode={slotCode} tile={tile} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export type LegendIndicator = "success" | "warning" | "danger";

const SWATCH: Record<LegendIndicator, string> = {
  success: "bg-success-indicator",
  warning: "bg-warning-indicator",
  danger: "bg-danger-indicator",
};

/** The key under a MachineMap, matching the tile meters. */
export const MachineMapLegend = ({
  items,
  showsSharedSlots = true,
}: {
  items: { indicator: LegendIndicator; label: string }[];
  showsSharedSlots?: boolean;
}) => (
  <ul className="flex flex-wrap gap-4 text-body-sm text-muted-strong">
    {items.map((item) => (
      <li key={item.label} className="flex items-center gap-1.5">
        <span aria-hidden className={`h-1 w-3.5 rounded-sm ${SWATCH[item.indicator]}`} />
        {item.label}
      </li>
    ))}
    {showsSharedSlots ? (
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="font-mono text-[10px] font-bold text-link">
          ×2
        </span>
        two products
      </li>
    ) : null}
  </ul>
);
