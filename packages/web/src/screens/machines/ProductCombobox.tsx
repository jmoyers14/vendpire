import { useMemo, useState } from "react";
import { inputClass } from "../../ui.tsx";
import type { ApiProduct } from "../../apiTypes.ts";
import { rankByName } from "../../utils/textMatch.ts";

/** What the combobox reads of a product, derived so a rename breaks here. */
export type ProductOption = Pick<
  ApiProduct,
  "id" | "name" | "defaultPriceCents" | "active"
>;

// Wider than the purchase search's 8: here the list is the whole picker.
const COMBOBOX_RESULT_LIMIT = 50;

interface ProductComboboxProps {
  products: ProductOption[];
  productId: string;
  onPick: (product: ProductOption) => void;
}

/**
 * Type-to-search product picker. An empty box lists every active product A–Z,
 * so it still works as a plain dropdown.
 */
export function ProductCombobox({
  products,
  productId,
  onPick,
}: ProductComboboxProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const activeProducts = useMemo(
    () =>
      products
        .filter((product) => product.active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );
  const searchTerm = query.trim();
  const results = searchTerm
    ? rankByName(activeProducts, searchTerm, COMBOBOX_RESULT_LIMIT)
    : activeProducts;
  const selectedName = products.find((p) => p.id === productId)?.name ?? "";

  const pick = (product: ProductOption) => {
    onPick(product);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div className="relative">
      <input
        className={inputClass}
        role="combobox"
        aria-label="Product"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={selectedName || "Search products…"}
        value={isOpen ? query : selectedName}
        onFocus={() => {
          setQuery("");
          setHighlightedIndex(0);
          setIsOpen(true);
        }}
        onBlur={() => setIsOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlightedIndex(0);
          setIsOpen(true);
        }}
        onKeyDown={(e) => {
          switch (e.key) {
            case "ArrowDown":
              e.preventDefault();
              setIsOpen(true);
              setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
              break;
            case "ArrowUp":
              e.preventDefault();
              setHighlightedIndex((i) => Math.max(i - 1, 0));
              break;
            case "Enter": {
              const product = results[highlightedIndex];
              if (isOpen && product) {
                e.preventDefault();
                pick(product);
              }
              break;
            }
            case "Escape":
              setIsOpen(false);
              break;
          }
        }}
      />

      {isOpen ? (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-card shadow-card"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              No product matches “{searchTerm}”.
            </li>
          ) : (
            results.map((product, index) => (
              <li
                key={product.id}
                role="option"
                aria-selected={index === highlightedIndex}
                // Mouse-down would blur the input and close this first.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => pick(product)}
                className={`cursor-pointer truncate px-3 py-2 text-sm text-body ${
                  index === highlightedIndex ? "bg-gray-100" : ""
                } ${product.id === productId ? "font-bold" : ""}`}
              >
                {product.name}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
