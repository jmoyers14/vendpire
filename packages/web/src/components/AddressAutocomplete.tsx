import { useEffect, useRef, useState } from "react";
import { trpcClient } from "../trpc.ts";
import { inputClass } from "./ui.tsx";

interface Suggestion {
  placeId: string;
  description: string;
  primary?: string;
  secondary?: string;
}

export interface ResolvedAddressFields {
  line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  geo: { lat: number; lng: number } | null;
}

interface AddressAutocompleteProps {
  /** The street-line text (controlled). */
  value: string;
  /** Fired on every keystroke, like a plain input. */
  onChange: (value: string) => void;
  /** Fired when the user picks a suggestion, with the structured address. */
  onResolved: (address: ResolvedAddressFields) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 300;

/**
 * Street-address field backed by Google Places (proxied through our API).
 * Suggestions appear as the user types; picking one fills the WHOLE address
 * (street/city/state/zip + coordinates) via `onResolved`. Free typing is still
 * allowed — selection just guarantees a clean, structured address. A session
 * token groups each typing burst + resolve for billing.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onResolved,
  placeholder,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const sessionToken = useRef(crypto.randomUUID());
  // Skip the lookup on the value change we cause by accepting a suggestion.
  const skipNextLookup = useRef(false);

  useEffect(() => {
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await trpcClient.address.autocomplete.query({
          input: query,
          sessionToken: sessionToken.current,
        });
        if (!cancelled) {
          setSuggestions(results);
          setOpen(results.length > 0);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [value]);

  const select = async (suggestion: Suggestion) => {
    skipNextLookup.current = true;
    setOpen(false);
    setSuggestions([]);
    try {
      const resolved = await trpcClient.address.resolve.query({
        placeId: suggestion.placeId,
        sessionToken: sessionToken.current,
      });
      if (resolved) {
        onResolved({
          line1: resolved.line1,
          city: resolved.city,
          state: resolved.state,
          zip: resolved.zip,
          geo: { lat: resolved.latitude, lng: resolved.longitude },
        });
      } else {
        onChange(suggestion.description);
      }
    } catch {
      onChange(suggestion.description);
    } finally {
      // A resolve closes the billing session; start a fresh one.
      sessionToken.current = crypto.randomUUID();
    }
  };

  return (
    <div className="relative">
      <input
        className={inputClass}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        // Delay so a suggestion click registers before the list unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(suggestion)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
              >
                <span className="text-gray-800">
                  {suggestion.primary ?? suggestion.description}
                </span>
                {suggestion.secondary && (
                  <span className="ml-1 text-gray-400">
                    {suggestion.secondary}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
