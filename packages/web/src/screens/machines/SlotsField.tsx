import { SlotFacePreview } from "./SlotFacePreview.tsx";
import { SlotGridEditor } from "./SlotGridEditor.tsx";
import { inputClass } from "../../ui.tsx";
import {
  parseSlotLines,
  type SlotsValue,
  toggleSlotsMode,
} from "./slotGrid.ts";

/**
 * The slots half of a machine or template form: build the face with the grid
 * generator, or type the codes by hand for machines whose labels don't follow
 * a pattern. Controlled — the parent owns the SlotsValue.
 */
export function SlotsField({
  value,
  onChange,
}: {
  value: SlotsValue;
  onChange: (value: SlotsValue) => void;
}) {
  const shelves = parseSlotLines(value.codesText);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Slots</span>
        <button
          type="button"
          onClick={() => onChange(toggleSlotsMode(value))}
          className="text-xs text-primary-600 hover:text-primary-500"
        >
          {value.mode === "grid" ? "Enter codes manually" : "Use grid generator"}
        </button>
      </div>
      {value.mode === "grid" ? (
        <SlotGridEditor
          rows={value.rows}
          onChange={(rows) => onChange({ ...value, rows })}
        />
      ) : (
        <div className="space-y-2">
          <textarea
            className={`${inputClass} font-mono`}
            placeholder={"One shelf per line, codes in walking order:\nA0 A2 A4 A6\nB1 B2 B3 B4 B5"}
            rows={4}
            value={value.codesText}
            onChange={(e) => onChange({ ...value, codesText: e.target.value })}
          />
          <SlotFacePreview shelves={shelves} />
          <p className="text-xs text-gray-500">{shelves.flat().length} slot(s)</p>
        </div>
      )}
    </div>
  );
}
