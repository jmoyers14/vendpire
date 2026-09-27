/**
 * Vendor-neutral address shapes the app speaks regardless of which maps
 * provider sits behind the port.
 */

/** A single typeahead suggestion for a partially-typed address. */
export interface AddressSuggestion {
  /** Provider place id — pass back to resolve the full address. */
  placeId: string;
  /** Full single-line label for the suggestion. */
  description: string;
  /** Bolded main line (e.g. street address), when the provider splits it out. */
  primary?: string;
  /** Secondary line (e.g. city/state), when the provider splits it out. */
  secondary?: string;
}

/**
 * A validated address resolved from a place id, already split into the
 * structured fields the Location entity stores.
 */
export interface ResolvedAddress {
  formattedAddress: string;
  line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number;
  longitude: number;
}

/**
 * Port for a maps provider. Named by capability (what the app needs), not by
 * vendor — the Google adapter implements it.
 */
export interface MapsClient {
  /**
   * Typeahead address suggestions for a partial query. `sessionToken` groups a
   * burst of keystrokes plus the final resolve into one billing session.
   */
  autocompleteAddress(
    input: string,
    sessionToken?: string,
  ): Promise<AddressSuggestion[]>;

  /** Resolve a place id into a structured address, or null if it can't be found. */
  resolveAddress(
    placeId: string,
    sessionToken?: string,
  ): Promise<ResolvedAddress | null>;
}
