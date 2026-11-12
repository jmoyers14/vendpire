import { normalizeGtin } from "@vendpire/domain";
import { useState } from "react";
import { Badge, Button, Field, insetFocusRing, TextInput } from "../../ui.tsx";
import {
  type CatalogItem,
  isPackItem,
  looksLikeBarcode,
  searchCatalogItems,
} from "./catalogSearch.ts";

interface ScanOrSearchInputProps {
  /** The operator's own catalog, already flattened by buildCatalogItems. */
  items: CatalogItem[];
  isBusy: boolean;
  /** Why the last scan didn't add a line, shown under the box. */
  error: string | null;
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
  isBusy,
  error,
  onSubmitBarcode,
  onPick,
}: ScanOrSearchInputProps) {
  const [value, setValue] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  const trimmed = value.trim();
  const isBarcode = looksLikeBarcode(trimmed) && normalizeGtin(trimmed) !== null;
  const results = isBarcode ? [] : searchCatalogItems(items, trimmed);
  const isShowingResults = isOpen && trimmed.length > 0 && !isBarcode;

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
    <Field label="Add an item" error={error ?? undefined}>
      <div className="relative">
        <div className="flex gap-2">
          {/* Plain text, not type="search": Escape there clears what's been typed. */}
          <TextInput
            placeholder="Scan a barcode, or search your products and packs"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setIsOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                // Enter picks the only match when searching — otherwise it's a scan.
                if (!isBarcode && results.length === 1 && results[0]) {
                  pick(results[0]);
                  return;
                }
                void submit();
              }
              if (event.key === "Escape") {
                setIsOpen(false);
              }
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            autoComplete="off"
          />
          <Button
            variant="secondary"
            size="lg"
            onClick={() => void submit()}
            disabled={isBusy || !trimmed || !isBarcode}
            className="shrink-0"
          >
            {isBusy ? "Adding…" : "Add"}
          </Button>
        </div>

        {isShowingResults ? (
          <ul className="absolute z-10 mt-1 max-h-80 w-full divide-y divide-divider overflow-auto rounded-control border border-line bg-card shadow-card">
            {results.length === 0 ? (
              <li className="px-4 py-3 text-body-sm text-muted-strong">
                Nothing in your catalog matches “{trimmed}”.
              </li>
            ) : (
              results.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    // Mouse-down would blur the input and close this first.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(item)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-action-soft ${insetFocusRing}`}
                  >
                    <Badge size="sm" tone={isPackItem(item) ? "action" : "neutral"}>
                      {isPackItem(item) ? "Pack" : "Item"}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink">{item.name}</span>
                      <span className="block font-mono text-body-sm text-muted-strong">
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
    </Field>
  );
}
