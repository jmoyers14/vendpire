import { useEffect, useId, useRef, useState } from "react";
import { trpcClient } from "../../trpc.ts";
import { TextInput } from "../../ui.tsx";

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
 * through our API), in a tinted strip above the form. Picking a result hands
 * back name + UPC + image in one go — no bag in hand needed. Community data:
 * expect the occasional miss or imageless hit; manual entry always remains.
 */
export function CatalogSearch({ onPick }: { onPick: (pick: CatalogPick) => void }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    const id = ++requestId.current;
    const handle = setTimeout(async () => {
      setIsSearching(true);
      try {
        const found = await trpcClient.candidates.search.query({ query: trimmed });
        if (requestId.current === id) {
          setResults(found);
          setIsOpen(true);
        }
      } catch {
        if (requestId.current === id) {
          setResults([]);
        }
      } finally {
        if (requestId.current === id) {
          setIsSearching(false);
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const pick = (result: Result) => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    onPick({ upc: result.upc, name: displayName(result), imageUrl: result.imageUrl });
  };

  return (
    <div className="flex flex-col gap-3 rounded-panel bg-action-soft px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
      <label htmlFor={inputId} className="text-button whitespace-nowrap text-link">
        Fill from catalog
      </label>
      <div className="relative flex-1">
        <TextInput
          id={inputId}
          type="search"
          placeholder="Search, e.g. fritos. Fills name, UPC and photo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          autoComplete="off"
        />
        {isSearching ? (
          <span className="absolute top-1/2 right-10 -translate-y-1/2 text-body-sm text-muted-strong">
            Searching…
          </span>
        ) : null}
        {isOpen ? (
          <ul className="absolute z-10 mt-1 max-h-80 w-full divide-y divide-divider overflow-auto rounded-control border border-line bg-card shadow-card">
            {results.length === 0 ? (
              <li className="px-4 py-3 text-body-sm text-muted-strong">
                No catalog matches. Enter the details below.
              </li>
            ) : (
              results.map((result) => (
                <li key={result.upc}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(result)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-action-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                  >
                    {result.imageUrl ? (
                      <img src={result.imageUrl} alt="" className="size-9 shrink-0 rounded object-contain" />
                    ) : (
                      <div className="size-9 shrink-0 rounded bg-divider" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-body text-ink">{displayName(result)}</span>
                      <span className="block font-mono text-body-sm text-muted-strong">{result.upc}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
