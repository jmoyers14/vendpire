/**
 * GTIN (barcode) normalization. Cameras and CSVs deliver a zoo of formats —
 * UPC-E (8 digits, printed on small cans), UPC-A (12), EAN-13 (13), GTIN-14
 * (14, case level). Everything is validated and normalized to a 14-digit
 * GTIN-14 string so one product code can never be stored under two spellings.
 */

export type GtinFormat = "upc-e" | "upc-a" | "ean-13" | "gtin-14";

export interface NormalizedGtin {
  /** Canonical 14-digit form — the only spelling that gets stored. */
  gtin14: string;
  /** What the input looked like before normalization. */
  format: GtinFormat;
  /**
   * True when the code was supplied at case level (a native 14-digit code
   * whose indicator digit is 1–8) — a strong signal it's a pack, not a unit.
   */
  likelyCase: boolean;
}

/** GS1 mod-10 check digit for the given digits (WITHOUT the check digit). */
export const gs1CheckDigit = (digits: string): number => {
  let sum = 0;
  // Weights 3,1,3,1… starting from the RIGHTMOST digit of `digits`.
  for (let i = 0; i < digits.length; i++) {
    const digit = Number(digits[digits.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
};

const hasValidCheckDigit = (code: string): boolean =>
  gs1CheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);

/**
 * Expand UPC-E (8 digits: number system, 6 data digits, check) to UPC-A
 * (12 digits). The check digit carries over unchanged — it's computed from
 * the expanded form, which is why expansion must happen before validation.
 */
const expandUpcE = (code: string): string | null => {
  const numberSystem = code[0];
  if (numberSystem !== "0" && numberSystem !== "1") {
    return null;
  }
  const [x1, x2, x3, x4, x5, x6] = code.slice(1, 7);
  const check = code[7];
  let body: string;
  if (x6 === "0" || x6 === "1" || x6 === "2") {
    body = `${x1}${x2}${x6}0000${x3}${x4}${x5}`;
  } else if (x6 === "3") {
    body = `${x1}${x2}${x3}00000${x4}${x5}`;
  } else if (x6 === "4") {
    body = `${x1}${x2}${x3}${x4}00000${x5}`;
  } else {
    body = `${x1}${x2}${x3}${x4}${x5}0000${x6}`;
  }
  return `${numberSystem}${body}${check}`;
};

/**
 * Normalize any scanned/typed barcode to GTIN-14, or null when the input
 * can't be a valid GTIN (wrong length, bad check digit, bad UPC-E prefix).
 */
export const normalizeGtin = (raw: string): NormalizedGtin | null => {
  const digits = raw.replace(/\D/g, "");
  let code = digits;
  let format: GtinFormat;

  switch (digits.length) {
    case 8: {
      const expanded = expandUpcE(digits);
      if (!expanded) {
        return null;
      }
      code = expanded;
      format = "upc-e";
      break;
    }
    case 12:
      format = "upc-a";
      break;
    case 13:
      format = "ean-13";
      break;
    case 14:
      format = "gtin-14";
      break;
    default:
      return null;
  }

  if (!hasValidCheckDigit(code)) {
    return null;
  }

  const gtin14 = code.padStart(14, "0");
  const likelyCase =
    format === "gtin-14" && gtin14[0] !== "0" && gtin14[0] !== "9";
  return { gtin14, format, likelyCase };
};
