import { inject, injectable } from "tsyringe";
import { MAPS_CLIENT_TOKEN } from "@vendpire/platform";
import type {
  AddressSuggestion,
  MapsClient,
  ResolvedAddress,
} from "@vendpire/platform";
import type { AddressService } from "./AddressService.ts";

// Below this many characters a query is too vague to be worth a provider call
// (and a wasted billing event), so we short-circuit to no suggestions.
const MIN_QUERY_LENGTH = 3;

/**
 * Address lookup logic. Guards against pointless provider calls (blank/too-
 * short queries, empty place ids) before delegating to the maps provider,
 * keeping autocomplete cheap and the rest of the app unaware of the provider.
 */
@injectable()
export class AddressServiceImpl implements AddressService {
  constructor(
    @inject(MAPS_CLIENT_TOKEN)
    private readonly maps: MapsClient,
  ) {}

  async suggest(
    query: string,
    sessionToken?: string,
  ): Promise<AddressSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return [];
    }
    return this.maps.autocompleteAddress(trimmed, sessionToken);
  }

  async resolve(
    placeId: string,
    sessionToken?: string,
  ): Promise<ResolvedAddress | null> {
    if (!placeId.trim()) {
      return null;
    }
    return this.maps.resolveAddress(placeId, sessionToken);
  }
}
