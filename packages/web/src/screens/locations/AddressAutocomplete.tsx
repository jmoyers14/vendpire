import { useEffect, useRef, useState } from "react";
import { trpcClient } from "../../trpc.ts";
import type { ApiLocation } from "../../apiTypes.ts";
import { insetFocusRing, TextInput } from "../../ui.tsx";

interface Suggestion {
  placeId: string;
  description: string;
  primary?: string;
  secondary?: string;
}

export type ResolvedAddressFields = ApiLocation["address"];

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return;
    }
    const query = value.trim();
    // Only while typing here: a saved address loading into the form isn't a search,
    // and each lookup is a billed Places call.
    const isTyping = document.activeElement === inputRef.current;
    if (query.length < 3 || !isTyping) {
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
    // The picked button unmounts; keep focus in the field rather than losing it to the page.
    inputRef.current?.focus();
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
    <div
      className="relative"
      // Closes only when focus leaves the field and its list, so Tab can reach a suggestion.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          inputRef.current?.focus();
        }
      }}
    >
      <TextInput
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full divide-y divide-divider overflow-auto rounded-control border border-line bg-card shadow-card">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(suggestion)}
                className={`block w-full px-4 py-2.5 text-left hover:bg-action-soft ${insetFocusRing}`}
              >
                <span className="text-body text-ink">
                  {suggestion.primary ?? suggestion.description}
                </span>
                {suggestion.secondary && (
                  <span className="ml-1.5 text-body-sm text-muted-strong">{suggestion.secondary}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
