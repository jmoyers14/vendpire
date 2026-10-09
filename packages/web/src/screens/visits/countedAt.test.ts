import { describe, expect, it } from "bun:test";
import { localDateTimeToIso, toLocalDateTimeInput } from "./countedAt.ts";

describe("toLocalDateTimeInput", () => {
  it("formats an instant as the local wall-clock the input expects", () => {
    // Built from local parts, so this passes in any zone the suite runs in.
    const at = new Date(2026, 9, 7, 14, 35);
    expect(toLocalDateTimeInput(at.toISOString())).toBe("2026-10-07T14:35");
  });

  it("zero-pads a single-digit month, day, hour and minute", () => {
    const at = new Date(2026, 0, 3, 9, 5);
    expect(toLocalDateTimeInput(at.toISOString())).toBe("2026-01-03T09:05");
  });

  it("is empty for an unparseable instant", () => {
    expect(toLocalDateTimeInput("not a date")).toBe("");
  });
});

describe("localDateTimeToIso", () => {
  it("reads the value in the browser's zone", () => {
    const iso = localDateTimeToIso("2026-10-07T14:35");
    expect(iso).toBe(new Date(2026, 9, 7, 14, 35).toISOString());
  });

  it("is null while the field is empty", () => {
    expect(localDateTimeToIso("")).toBeNull();
    expect(localDateTimeToIso("   ")).toBeNull();
  });

  /**
   * `new Date` would accept several of these: "2026-10-" parses as October
   * 1st, and a date-only string is read as UTC rather than local, so a partial
   * value would land shifted by the zone offset instead of being rejected.
   */
  it("is null for a value that isn't a complete local date-time", () => {
    expect(localDateTimeToIso("2026-10-")).toBeNull();
    expect(localDateTimeToIso("2026-10-07")).toBeNull();
    expect(localDateTimeToIso("2026-10-07T14")).toBeNull();
    expect(localDateTimeToIso("garbage")).toBeNull();
  });

  it("accepts the seconds some browsers append", () => {
    expect(localDateTimeToIso("2026-10-07T14:35:00")).toBe(
      new Date(2026, 9, 7, 14, 35).toISOString(),
    );
  });
});

// The form round-trips through both on every render, so a drift between them
// would quietly shift a visit by hours.
describe("round trip", () => {
  it("preserves the instant to the minute", () => {
    const at = new Date(2026, 9, 7, 14, 35);
    const iso = localDateTimeToIso(toLocalDateTimeInput(at.toISOString()));
    expect(iso).toBe(at.toISOString());
  });
});
