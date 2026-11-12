import { describe, expect, test } from "bun:test";
import {
  addressLineFor,
  buildLocationInput,
  EMPTY_LOCATION_DRAFT,
  type LocationDraft,
  telHrefFor,
} from "./locationForm.ts";

const draft = (patch: Partial<LocationDraft> = {}): LocationDraft => ({
  ...EMPTY_LOCATION_DRAFT,
  name: "  Westside Laundromat ",
  ...patch,
});

describe("buildLocationInput", () => {
  test("trims text and turns blanks into nulls", () => {
    const result = buildLocationInput(
      draft({ line1: " 12 Main St ", city: "", contactPhone: " ", notes: "Back door" }),
    );
    expect(result).toEqual({
      input: {
        name: "Westside Laundromat",
        address: { line1: "12 Main St", city: null, state: "CA", zip: null, geo: null },
        contact: { name: null, phone: null, email: null },
        commission: { type: "none" },
        notes: "Back door",
        active: true,
      },
    });
  });

  test("a percent commission keeps its basis, in basis points", () => {
    const result = buildLocationInput(
      draft({ commissionType: "percent", commissionPercent: "12.5", commissionBasis: "net" }),
    );
    expect("input" in result && result.input.commission).toEqual({
      type: "percent",
      percentBps: 1250,
      basis: "net",
    });
  });

  test("a flat commission is in cents", () => {
    const result = buildLocationInput(draft({ commissionType: "flat", commissionFlat: "50" }));
    expect("input" in result && result.input.commission).toEqual({ type: "flat", flatCents: 5000 });
  });

  test("puts each problem under its own field", () => {
    expect(buildLocationInput(draft({ name: " " }))).toEqual({ errors: { name: "Enter a name" } });
    expect(
      buildLocationInput(draft({ name: "", commissionType: "percent", commissionPercent: "120" })),
    ).toEqual({
      errors: { name: "Enter a name", commissionPercent: "Enter a percent between 0 and 100" },
    });
    expect(buildLocationInput(draft({ commissionType: "flat", commissionFlat: "0" }))).toEqual({
      errors: { commissionFlat: "Enter a dollar amount, e.g. 50" },
    });
  });

  test("ignores the amount fields of a commission type that isn't chosen", () => {
    const result = buildLocationInput(draft({ commissionType: "none", commissionPercent: "abc" }));
    expect("input" in result && result.input.commission).toEqual({ type: "none" });
  });
});

describe("addressLineFor", () => {
  test("joins what's there into one line", () => {
    const geo = null;
    expect(
      addressLineFor({ line1: "12 Main St", city: "San Jose", state: "CA", zip: "95112", geo }),
    ).toBe("12 Main St, San Jose, CA 95112");
    expect(addressLineFor({ line1: null, city: "San Jose", state: "CA", zip: null, geo })).toBe(
      "San Jose, CA",
    );
    expect(addressLineFor({ line1: null, city: null, state: null, zip: null, geo })).toBeNull();
  });
});

describe("telHrefFor", () => {
  test("keeps only what a dialer needs", () => {
    expect(telHrefFor("(408) 555-0134")).toBe("tel:4085550134");
    expect(telHrefFor("+1 408 555 0134")).toBe("tel:+14085550134");
  });

  test("drops an extension instead of dialing its digits", () => {
    expect(telHrefFor("408-555-0134 x12")).toBe("tel:4085550134");
    expect(telHrefFor("408-555-0134 ext. 12")).toBe("tel:4085550134");
  });
});
