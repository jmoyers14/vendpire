import { describe, expect, it } from "bun:test";
import { parseAddressComponents } from "./addressComponents.ts";

describe("parseAddressComponents", () => {
  it("maps a full US address into structured fields", () => {
    const result = parseAddressComponents([
      { longText: "123", types: ["street_number"] },
      { longText: "Main Street", types: ["route"] },
      { longText: "San Diego", types: ["locality", "political"] },
      { longText: "California", shortText: "CA", types: ["administrative_area_level_1"] },
      { longText: "92101", types: ["postal_code"] },
    ]);
    expect(result).toEqual({
      line1: "123 Main Street",
      city: "San Diego",
      state: "CA",
      zip: "92101",
    });
  });

  it("returns nulls for missing pieces instead of guessing", () => {
    const result = parseAddressComponents([
      { longText: "San Diego", types: ["locality"] },
    ]);
    expect(result).toEqual({ line1: null, city: "San Diego", state: null, zip: null });
  });

  it("falls back to sublocality when there is no locality", () => {
    const result = parseAddressComponents([
      { longText: "Brooklyn", types: ["sublocality", "political"] },
    ]);
    expect(result.city).toBe("Brooklyn");
  });
});
