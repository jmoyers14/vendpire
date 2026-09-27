/**
 * Mapping from Google's addressComponents array to the structured fields the
 * Location entity stores. Pure so it's unit-testable without the API.
 */
export interface GoogleAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface StructuredAddress {
  line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export function parseAddressComponents(
  components: GoogleAddressComponent[],
): StructuredAddress {
  const byType = (type: string): GoogleAddressComponent | undefined =>
    components.find((component) => component.types?.includes(type));

  const streetNumber = byType("street_number")?.longText;
  const route = byType("route")?.longText;
  const line1 =
    streetNumber && route
      ? `${streetNumber} ${route}`
      : (route ?? streetNumber ?? null);

  // locality is the usual US city; sublocality/postal_town cover the edge
  // cases (NYC boroughs, some non-US formats).
  const city =
    byType("locality")?.longText ??
    byType("sublocality")?.longText ??
    byType("postal_town")?.longText ??
    null;

  return {
    line1,
    city,
    state: byType("administrative_area_level_1")?.shortText ?? null,
    zip: byType("postal_code")?.longText ?? null,
  };
}
