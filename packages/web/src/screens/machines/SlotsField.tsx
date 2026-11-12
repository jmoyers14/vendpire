import { useId } from "react";
import { Button, Field, MachineMap, type MachineTile, TextArea } from "../../ui.tsx";
import { plural } from "../../utils/text.ts";
import { SlotGridEditor } from "./SlotGridEditor.tsx";
import { type SlotsValue, slotsValueToShelves, toggleSlotsMode } from "./slotGrid.ts";

// The builder only shows where each slot sits, so a tile is just its code.
const layoutTileFor = (slotCode: string): MachineTile => ({ value: "", label: slotCode });

/**
 * The layout half of a machine or template form: grid controls or typed codes,
 * with the face drawn below exactly as it will be saved.
 */
export function SlotsField({
  value,
  error,
  onChange,
}: {
  value: SlotsValue;
  /** A problem with the layout as a whole, e.g. no slots at all. */
  error?: string;
  onChange: (value: SlotsValue) => void;
}) {
  const errorId = useId();
  const shelves = slotsValueToShelves(value);
  const sizeLabel = `${plural(shelves.flat().length, { one: "slot", many: "slots" })} on ${plural(shelves.length, { one: "shelf", many: "shelves" })}`;

  return (
    <div
      role="group"
      aria-label="Layout"
      aria-describedby={error ? errorId : undefined}
      className="grid gap-5"
    >
      {value.mode === "grid" ? (
        <SlotGridEditor rows={value.rows} onChange={(rows) => onChange({ ...value, rows })} />
      ) : (
        <Field
          label="Slot codes"
          hint="One shelf per line, codes in the order you walk them, separated by spaces."
        >
          <TextArea
            rows={5}
            className="font-mono"
            placeholder={"A0 A2 A4 A6\nB1 B2 B3 B4 B5"}
            value={value.codesText}
            onChange={(event) => onChange({ ...value, codesText: event.target.value })}
          />
        </Field>
      )}

      <div className="grid gap-3 rounded-panel bg-app p-3">
        {shelves.length > 0 ? (
          // One image for a screen reader rather than a tile per slot; the codes are in the controls.
          <div role="img" aria-label={`Layout preview: ${sizeLabel}`}>
            <div aria-hidden>
              <MachineMap shelves={shelves} tileFor={layoutTileFor} />
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-body-sm text-muted-strong">
            No slots yet. Type a shelf of codes above.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm text-muted-strong tabular-nums">{sizeLabel}</p>
          <Button variant="text" size="sm" onClick={() => onChange(toggleSlotsMode(value))}>
            {value.mode === "grid" ? "Type the codes instead" : "Use the grid instead"}
          </Button>
        </div>
      </div>
      {error ? (
        <p id={errorId} className="text-body-sm font-bold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
