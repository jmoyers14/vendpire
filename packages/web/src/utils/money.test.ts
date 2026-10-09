import { describe, expect, it } from "bun:test";
import {
  bpsToInput,
  centsToInput,
  formatBps,
  formatCents,
  formatSignedCents,
  parseDollarsToCents,
  parsePercentToBps,
} from "./money.ts";

describe("formatCents", () => {
  it("renders a display string with symbol and grouping", () => {
    expect(formatCents(175)).toBe("$1.75");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("centsToInput", () => {
  it("renders bare dollars, with no symbol or grouping", () => {
    expect(centsToInput(175)).toBe("1.75");
    expect(centsToInput(123456)).toBe("1234.56");
    expect(centsToInput(0)).toBe("0");
  });

  // The reason this exists separately from formatCents: a text field's value
  // has to survive being read back out of it.
  it("round-trips through parseDollarsToCents", () => {
    for (const cents of [0, 1, 99, 175, 2000, 123456]) {
      expect(parseDollarsToCents(centsToInput(cents))).toBe(cents);
    }
  });

  it("produces something formatCents would not round-trip", () => {
    expect(parseDollarsToCents(formatCents(123456))).not.toBe(123456);
  });
});

describe("parseDollarsToCents", () => {
  it("parses a dollars string to integer cents", () => {
    expect(parseDollarsToCents("1.75")).toBe(175);
    expect(parseDollarsToCents("0")).toBe(0);
  });

  it("rounds sub-cent input to the nearest cent", () => {
    expect(parseDollarsToCents("1.004")).toBe(100);
    expect(parseDollarsToCents("1.006")).toBe(101);
  });

  it("rejects blanks, words, and negatives", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("free")).toBeNull();
    expect(parseDollarsToCents("-1")).toBeNull();
  });
});

describe("bpsToInput", () => {
  it("renders bare percent", () => {
    expect(bpsToInput(1000)).toBe("10");
    expect(bpsToInput(1050)).toBe("10.5");
  });

  it("round-trips through parsePercentToBps", () => {
    for (const bps of [1, 1000, 1050, 10000]) {
      expect(parsePercentToBps(bpsToInput(bps))).toBe(bps);
    }
  });
});

describe("formatBps", () => {
  it("renders a display string with a percent sign", () => {
    expect(formatBps(1000)).toBe("10%");
  });
});

describe("parsePercentToBps", () => {
  it("rejects zero, negatives, and anything over 100", () => {
    expect(parsePercentToBps("0")).toBeNull();
    expect(parsePercentToBps("-5")).toBeNull();
    expect(parsePercentToBps("101")).toBeNull();
  });
});

describe("formatSignedCents", () => {
  it("marks a gain with a plus", () => {
    expect(formatSignedCents(17100)).toBe("+$171.00");
  });

  // A true minus sign (U+2212), not a hyphen — the design system's money rule.
  it("marks a loss with a minus sign", () => {
    expect(formatSignedCents(-3600)).toBe("−$36.00");
  });

  it("leaves zero unsigned, since +$0.00 reads as a gain", () => {
    expect(formatSignedCents(0)).toBe("$0.00");
  });
});
