import { countInputClass, hintClass, inputClass, labelClass } from "../../ui.tsx";
import type { Arrival } from "./restock.ts";
import type { VisitRow } from "./visitRows.ts";

const linkClass = "text-sm text-primary-600 hover:text-primary-500";

/**
 * A product landing in this slot: moved or swapped in (tagged with its source)
 * or new stock from + Add product. New stock offers "Came from?" chips for
 * products pulled back to the van elsewhere; only a tap links them.
 */
export function ArrivalRow({
  arrival,
  productName,
  suggestedSources,
  onChange,
  onSourceLink,
  onRemove,
}: {
  arrival: Arrival;
  productName: string;
  /** Empty unless the arrival is new stock. */
  suggestedSources: readonly VisitRow[];
  onChange: (patch: Partial<Pick<Arrival, "added" | "bestBy">>) => void;
  onSourceLink: (source: VisitRow) => void;
  onRemove: () => void;
}) {
  const isNewStock = arrival.fromSlotCode === null;

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-gray-800">
          {isNewStock ? "+ " : "← "}
          {productName}
          <span className="font-normal text-muted">
            {isNewStock ? " (new stock)" : ` (from ${arrival.fromSlotCode})`}
          </span>
        </span>
        {isNewStock ? (
          <button type="button" onClick={onRemove} className={linkClass}>
            Remove
          </button>
        ) : (
          <span className="shrink-0 text-xs text-muted">
            Change it in {arrival.fromSlotCode}
          </span>
        )}
      </div>

      {isNewStock && suggestedSources.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestedSources.map((source) => (
            <button
              key={source.slotCode}
              type="button"
              onClick={() => onSourceLink(source)}
              className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700 hover:bg-primary-100"
            >
              Came from {source.slotCode}?
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Added</span>
          <input
            inputMode="numeric"
            className={countInputClass}
            placeholder="—"
            value={arrival.added}
            onChange={(e) => onChange({ added: e.target.value })}
          />
          <span className={hintClass}>
            Everything that went in, moved units included
          </span>
        </label>
        {arrival.tracksExpiration ? (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Best by</span>
            <input
              type="date"
              className={inputClass}
              value={arrival.bestBy}
              onChange={(e) => onChange({ bestBy: e.target.value })}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
