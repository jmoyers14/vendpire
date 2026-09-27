import type { AddressSuggestion, ResolvedAddress } from "@vendpire/platform";

export type { AddressSuggestion, ResolvedAddress };

/**
 * Address lookup for typeahead + validation. Backs the address autocomplete
 * field: `suggest` powers the dropdown as the user types; `resolve` turns the
 * chosen suggestion into a structured, validated address. `sessionToken` ties
 * a burst of suggestions and the final resolve into one billing session.
 */
export interface AddressService {
  suggest(query: string, sessionToken?: string): Promise<AddressSuggestion[]>;
  resolve(
    placeId: string,
    sessionToken?: string,
  ): Promise<ResolvedAddress | null>;
}
