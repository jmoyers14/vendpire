import { inputClass } from "./Field.tsx";

/**
 * Filter box for a list that's already in memory. A plain input, not a
 * combobox: it narrows a table in place rather than opening a result popup, so
 * there is no overlay, no keyboard navigation and no debounce to get wrong.
 *
 * Width is the caller's business — `inputClass` is `w-full`, so screens wrap
 * this in a sized box rather than fighting utility ordering.
 */
export const SearchInput = ({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name. Defaults to the placeholder, which is the visible text. */
  label?: string;
}) => (
  <input
    type="search"
    className={inputClass}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    aria-label={label ?? placeholder}
    autoComplete="off"
  />
);
