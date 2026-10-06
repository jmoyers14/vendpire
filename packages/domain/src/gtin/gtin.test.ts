import { describe, expect, it } from "bun:test";
import { gs1CheckDigit, normalizeGtin } from "./gtin.ts";
import type { NormalizedGtin } from "./gtin.ts";
import vectors from "./vectors.json";

/**
 * Cases live in `vectors.json` rather than inline, because Phase 2 ports
 * `normalizeGtin` to Swift and `GtinTests.swift` reads the same file as a
 * bundle resource. If only one suite owned the cases, the two implementations
 * would drift the first time someone fixed a UPC-E edge case.
 *
 * Add a case to the JSON and both suites pick it up.
 */

interface NormalizeVector {
  readonly input: string;
  readonly note: string;
  readonly expected: NormalizedGtin | null;
}

/**
 * A JSON import widens `format` to `string`, so the vectors need annotating to
 * compare against `NormalizedGtin`. Doing it here rather than at each call site
 * means a change to that type is a compile error in this file instead of a
 * silently weaker test.
 */
const normalizeVectors = vectors.normalize as readonly NormalizeVector[];

describe("gs1CheckDigit", () => {
  for (const { digits, expected, note } of vectors.checkDigits) {
    it(`${digits} → ${expected} (${note})`, () => {
      expect(gs1CheckDigit(digits)).toBe(expected);
    });
  }
});

describe("normalizeGtin", () => {
  for (const { input, expected, note } of normalizeVectors) {
    const label = input === "" ? "(empty string)" : input;
    it(`${label} — ${note}`, () => {
      expect(normalizeGtin(input)).toEqual(expected);
    });
  }
});

describe("normalizeGtin — equivalences", () => {
  for (const { inputs, note } of vectors.equivalences) {
    it(note, () => {
      const normalized = inputs.map((input) => normalizeGtin(input)?.gtin14);

      expect(normalized.every((gtin14) => gtin14 !== undefined)).toBe(true);
      expect(new Set(normalized).size).toBe(1);
    });
  }
});

describe("vectors.json", () => {
  it("covers every GTIN format", () => {
    const formats = new Set(
      normalizeVectors
        .map((v) => v.expected?.format)
        .filter((format) => format !== undefined),
    );

    expect(formats).toEqual(new Set(["upc-e", "upc-a", "ean-13", "gtin-14"]));
  });

  it("covers both the accepted and the rejected path", () => {
    expect(normalizeVectors.some((v) => v.expected === null)).toBe(true);
    expect(normalizeVectors.some((v) => v.expected !== null)).toBe(true);
  });
});
