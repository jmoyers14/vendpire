import { describe, expect, it } from "bun:test";
import { toCommission } from "./LocationRepositoryImpl.ts";

/**
 * The boundary where a loose stored document becomes the strict
 * LocationCommission union. Writes can't produce an inconsistent document —
 * zod's discriminated union sees to that — so these cases are about documents
 * edited outside the API.
 */
describe("toCommission", () => {
  it("keeps a percent commission's rate and basis", () => {
    expect(
      toCommission({ type: "percent", percentBps: 1500, basis: "net" }),
    ).toEqual({ type: "percent", percentBps: 1500, basis: "net" });
  });

  it("defaults a percent commission with no basis to gross", () => {
    expect(toCommission({ type: "percent", percentBps: 1000 })).toEqual({
      type: "percent",
      percentBps: 1000,
      basis: "gross",
    });
  });

  it("keeps a flat commission's amount", () => {
    expect(toCommission({ type: "flat", flatCents: 5000 })).toEqual({
      type: "flat",
      flatCents: 5000,
    });
  });

  it("drops the stored null padding that the old shape carried", () => {
    expect(
      toCommission({
        type: "none",
        percentBps: null,
        flatCents: null,
        basis: null,
      }),
    ).toEqual({ type: "none" });
  });

  // One malformed document must not break the whole locations list, so the
  // mapper falls back rather than throwing.
  it("falls back to none when a percent commission has no rate", () => {
    expect(toCommission({ type: "percent", percentBps: null })).toEqual({
      type: "none",
    });
  });

  it("falls back to none when a flat commission has no amount", () => {
    expect(toCommission({ type: "flat", flatCents: null })).toEqual({
      type: "none",
    });
  });

  it("ignores payload left behind on a none commission", () => {
    expect(
      toCommission({ type: "none", percentBps: 1000, flatCents: 500 }),
    ).toEqual({ type: "none" });
  });
});
