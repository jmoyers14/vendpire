import { inject, injectable } from "tsyringe";
import { MAPS_CONFIG_TOKEN, type MapsConfig } from "./mapsConfig.ts";
import { parseAddressComponents } from "./addressComponents.ts";
import type { GoogleAddressComponent } from "./addressComponents.ts";
import type {
  AddressSuggestion,
  MapsClient,
  ResolvedAddress,
} from "./MapsClient.ts";

const PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";

// Shape of the slices of the Places (New) responses we actually read.
interface AutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
}

interface PlaceDetailsResponse {
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: GoogleAddressComponent[];
}

/**
 * Google adapter for the MapsClient port. The only file that knows about the
 * Places API or holds the Maps key — everything Google-specific (endpoints,
 * field masks, component types) is contained here so the rest of the app
 * stays provider-agnostic.
 */
@injectable()
export class GoogleMapsClient implements MapsClient {
  constructor(
    @inject(MAPS_CONFIG_TOKEN)
    private readonly config: MapsConfig,
  ) {}

  async autocompleteAddress(
    input: string,
    sessionToken?: string,
  ): Promise<AddressSuggestion[]> {
    const apiKey = this.requireKey();

    const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input,
        ...(sessionToken ? { sessionToken } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Google Places autocomplete failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as AutocompleteResponse;
    return (json.suggestions ?? []).flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction?.placeId) {
        return [];
      }
      return [
        {
          placeId: prediction.placeId,
          description: prediction.text?.text ?? "",
          primary: prediction.structuredFormat?.mainText?.text,
          secondary: prediction.structuredFormat?.secondaryText?.text,
        },
      ];
    });
  }

  async resolveAddress(
    placeId: string,
    sessionToken?: string,
  ): Promise<ResolvedAddress | null> {
    const apiKey = this.requireKey();

    const url = new URL(`${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`);
    if (sessionToken) {
      url.searchParams.set("sessionToken", sessionToken);
    }

    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        // Field mask keeps the response (and the billing SKU) to what we need.
        "X-Goog-FieldMask": "formattedAddress,location,addressComponents",
      },
    });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Google Place details failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as PlaceDetailsResponse;
    if (
      !json.formattedAddress ||
      json.location?.latitude == null ||
      json.location?.longitude == null
    ) {
      return null;
    }
    return {
      formattedAddress: json.formattedAddress,
      ...parseAddressComponents(json.addressComponents ?? []),
      latitude: json.location.latitude,
      longitude: json.location.longitude,
    };
  }

  private requireKey(): string {
    const apiKey = this.config.apiKey;
    if (!apiKey) {
      throw new Error("Google Maps API key is not configured");
    }
    return apiKey;
  }
}
