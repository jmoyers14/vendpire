import { describe, expect, it } from "bun:test";
import * as domain from "./index.ts";

/**
 * The barrel is the only entry point (`exports` has just "."), so a module that
 * never got re-exported is invisible to the api and web packages — and that
 * failure shows up as a confusing missing import rather than as a test.
 */
describe("the @vendpire/domain barrel", () => {
  const exported = domain as Record<string, unknown>;

  for (const name of [
    "gs1CheckDigit",
    "normalizeGtin",
    "allocateProportionally",
    "normalizeSlots",
    "levelAfter",
    "diffVisits",
    "intervalsForMachine",
    "dispositionFor",
    "isWrittenOff",
    "buildCostBasis",
    "cogsForUnits",
    "unitCostCentsForDisplay",
    "buildIntervalPnl",
    "buildPnlTotals",
  ]) {
    it(`exports ${name}`, () => {
      expect(typeof exported[name]).toBe("function");
    });
  }
});
