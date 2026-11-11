import {
  Alert,
  Button,
  Card,
  type LegendIndicator,
  MachineMap,
  MachineMapLegend,
  type MachineTile,
  ProgressBar,
} from "../../ui.tsx";

const COUNT_LEGEND: { indicator: LegendIndicator; label: string }[] = [
  { indicator: "success", label: "Stocked" },
  { indicator: "warning", label: "Low (30% or less)" },
  { indicator: "danger", label: "Empty" },
];

/**
 * The machine on the left of Log Visit: the map, its legend and the
 * step's progress. While a Move or Swap waits for a slot, a banner above says
 * so and the tiles become targets.
 */
export function VisitMapPane({
  step,
  shelves,
  tileFor,
  selectedCode,
  onSelect,
  progress,
  pickBanner,
  onMarkRestUnchanged,
}: {
  step: "count" | "restock" | "review";
  shelves: string[][];
  tileFor: (slotCode: string) => MachineTile;
  selectedCode: string | null;
  onSelect: (slotCode: string) => void;
  /** Slots counted in Count; slots answered in Restock and Review. */
  progress: { done: number; total: number };
  pickBanner: { text: string; onCancel: () => void } | null;
  /** Shown while anything counted is still unanswered. */
  onMarkRestUnchanged: (() => void) | null;
}) {
  const isCount = step === "count";
  const noun = isCount ? "counted" : "answered";
  return (
    <aside aria-label="Machine map" className="grid min-w-0 gap-4 lg:sticky lg:top-6">
      {pickBanner ? (
        <Alert
          tone="warning"
          title={pickBanner.text}
          action={
            <Button variant="text" onClick={pickBanner.onCancel}>
              Cancel
            </Button>
          }
        />
      ) : null}
      <Card className="grid gap-4 border border-line p-5">
        <h2 className="font-display text-heading text-ink">Machine</h2>
        <MachineMap
          shelves={shelves}
          tileFor={tileFor}
          selectedCode={selectedCode}
          onSelect={onSelect}
        />
        {isCount ? <MachineMapLegend items={COUNT_LEGEND} /> : null}
        <div className="grid gap-2">
          <ProgressBar value={progress.done} max={progress.total} label={`Slots ${noun}`} />
          <div className="flex flex-wrap items-center justify-between gap-3 text-body-sm text-ink-soft tabular-nums">
            <span>
              {progress.done} of {progress.total} {noun}
            </span>
            {onMarkRestUnchanged ? (
              <Button variant="text" size="sm" onClick={onMarkRestUnchanged}>
                Mark the rest unchanged
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </aside>
  );
}
