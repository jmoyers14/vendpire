import { useEffect, useRef, useState } from "react";
import { trpcClient } from "../../trpc.ts";
import { inputClass } from "../../ui.tsx";

export interface CatalogPick {
  upc: string;
  name: string;
  imageUrl: string | null;
}

interface Result {
  upc: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

const DEBOUNCE_MS = 350;

const displayName = (result: Result): string => {
  if (result.name && result.brand && !result.name.toLowerCase().includes(result.brand.toLowerCase())) {
    return `${result.brand} ${result.name}`;
  }
  return result.name ?? result.upc;
};

/**
 * Search-as-you-type over the product catalog (Open Food Facts, proxied
 * through our API). Picking a result hands back name + UPC + image in one go —
 * no bag in hand needed. Community data: expect the occasional miss or
 * imageless hit; manual entry always remains.
 */
export function CatalogSearch({ onPick }: { onPick: (pick: CatalogPick) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const id = ++requestId.current;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await trpcClient.products.searchCatalog.query({
          query: trimmed,
        });
        if (requestId.current === id) {
          setResults(found);
          setOpen(true);
        }
      } catch {
        if (requestId.current === id) {
          setResults([]);
        }
      } finally {
        if (requestId.current === id) {
          setSearching(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const pick = (result: Result) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    onPick({
      upc: result.upc,
      name: displayName(result),
      imageUrl: result.imageUrl,
    });
  };

  return (
    <div className="relative">
      <input
        className={inputClass}
        placeholder="Search the catalog (e.g. fritos) — fills name, UPC, and photo"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {searching ? (
        <span className="absolute right-3 top-2.5 text-xs text-gray-400">
          searching…
        </span>
      ) : null}
      {open ? (
        <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">
              No catalog matches — enter details manually below.
            </li>
          ) : (
            results.map((result) => (
              <li key={result.upc}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(result)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  {result.imageUrl ? (
                    <img
                      src={result.imageUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded object-contain"
                    />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded bg-gray-100" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-gray-800">
                      {displayName(result)}
                    </span>
                    <span className="block font-mono text-xs text-gray-400">
                      {result.upc}
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
