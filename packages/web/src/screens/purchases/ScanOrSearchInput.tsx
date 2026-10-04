import { useState } from "react";
import { normalizeGtin } from "@vendpire/domain";
import { Button } from "../../ui.tsx";
import { inputClass } from "../../ui.tsx";
import {
  type CatalogItem,
  isPackItem,
  looksLikeBarcode,
  searchCatalogItems,
} from "./catalogSearch.ts";

interface ScanOrSearchInputProps {
  /** The operator's own catalog, already flattened by buildCatalogItems. */
  items: CatalogItem[];
  busy: boolean;
  /**
   * Resolve a scanned code. Resolves to true when the code was handled and the
   * box should clear — false leaves the text in place so a digit can be fixed.
   */
  onSubmitBarcode: (code: string) => Promise<boolean>;
  onPick: (item: CatalogItem) => void;
}

/**
 * The single entry point for adding a line: scan a barcode, or search the
 * catalog by name. One box rather than two, because a scanner gun only ever
 * emits digits — so the input can tell a scan from a person typing without
 * asking anyone to pick a mode first.
 *
 * A valid barcode waits for Enter and never opens the dropdown, which keeps
 * the scanner path free of flicker. Anything else searches as you type,
 * including a digit string that isn't a valid GTIN — a product named "350"
 * stays findable.
 */
export function ScanOrSearchInput({
  items,
  busy,
  onSubmitBarcode,
  onPick,
}: ScanOrSearchInputProps) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(true);

  const trimmed = value.trim();
  const isBarcode = looksLikeBarcode(trimmed) && normalizeGtin(trimmed) !== null;
  const results = isBarcode ? [] : searchCatalogItems(items, trimmed);
  const showResults = open && trimmed.length > 0 && !isBarcode;

  const submit = async () => {
    if (!trimmed) {
      return;
    }
    if (await onSubmitBarcode(trimmed)) {
      setValue("");
    }
  };

  const pick = (item: CatalogItem) => {
    onPick(item);
    setValue("");
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          className={`${inputClass} font-mono`}
          placeholder="Scan a barcode, or search your products and cases"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              // Enter picks the only match when searching — otherwise it's a scan.
              if (!isBarcode && results.length === 1 && results[0]) {
                pick(results[0]);
                return;
              }
              void submit();
            }
            if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
          aria-label="Scan a barcode or search your catalog"
        />
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={busy || !trimmed || !isBarcode}
          className="shrink-0"
        >
          {busy ? "…" : "Add"}
        </Button>
      </div>

      {showResults ? (
        <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-card shadow-card">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              Nothing in your catalog matches “{trimmed}”.
            </li>
          ) : (
            results.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  // Mouse-down would blur the input and close this first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-100"
                >
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      isPackItem(item)
                        ? "bg-primary-100 text-primary-700"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {isPackItem(item) ? "Case" : "Item"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-body">
                      {item.name}
                    </span>
                    <span className="block font-mono text-xs text-muted">
                      {item.barcode ?? "no barcode yet"}
                      {isPackItem(item) ? ` · ${item.units} units` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
