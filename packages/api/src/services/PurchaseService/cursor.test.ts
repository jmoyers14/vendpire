import { describe, expect, it } from "bun:test";
import { decodePurchaseCursor, encodePurchaseCursor } from "./cursor.ts";

const AT = "2026-09-20T12:00:00.000Z";
const ID = "6500a1b2c3d4e5f607182930";

describe("encodePurchaseCursor", () => {
  it("round-trips a position", () => {
    expect(decodePurchaseCursor(encodePurchaseCursor({ purchasedAt: AT, id: ID })))
      .toEqual({ purchasedAt: AT, id: ID });
  });

  it("emits only URL-safe characters, so it survives a query string", () => {
    const encoded = encodePurchaseCursor({ purchasedAt: AT, id: ID });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("preserves millisecond precision", () => {
    const at = "2026-09-20T00:00:00.123Z";
    expect(decodePurchaseCursor(encodePurchaseCursor({ purchasedAt: at, id: ID })))
      .toEqual({ purchasedAt: at, id: ID });
  });

  // The keyset's equality branch compares against this exact instant. If a
  // midnight timestamp ever came back as a date-only string, the branch would
  // silently match nothing and rows would be skipped with no error.
  it("preserves a midnight instant rather than collapsing it to a date", () => {
    const midnight = "2026-09-20T00:00:00.000Z";
    const decoded = decodePurchaseCursor(
      encodePurchaseCursor({ purchasedAt: midnight, id: ID }),
    );
    expect(decoded?.purchasedAt).toBe(midnight);
  });
});

describe("decodePurchaseCursor", () => {
  it("rejects the empty string", () => {
    expect(decodePurchaseCursor("")).toBeNull();
  });

  it("rejects junk that isn't base64 at all", () => {
    expect(decodePurchaseCursor("!!!!")).toBeNull();
  });

  it("rejects a well-formed base64 payload with no separator", () => {
    expect(decodePurchaseCursor(Buffer.from(AT).toString("base64url"))).toBeNull();
  });

  it("rejects a payload with too many segments", () => {
    expect(
      decodePurchaseCursor(Buffer.from(`${AT}|${ID}|extra`).toString("base64url")),
    ).toBeNull();
  });

  it("rejects an id that is not 24 characters", () => {
    expect(
      decodePurchaseCursor(Buffer.from(`${AT}|abc123`).toString("base64url")),
    ).toBeNull();
  });

  // Load-bearing: this is what guarantees the repository's _id string cast
  // cannot raise a Mongoose CastError, which would surface as a 500.
  it("rejects a 24-character id that isn't hex", () => {
    expect(
      decodePurchaseCursor(
        Buffer.from(`${AT}|zzzzzzzzzzzzzzzzzzzzzzzz`).toString("base64url"),
      ),
    ).toBeNull();
  });

  it("rejects an unparseable date", () => {
    expect(
      decodePurchaseCursor(Buffer.from(`not-a-date|${ID}`).toString("base64url")),
    ).toBeNull();
  });

  it("rejects an empty date segment", () => {
    expect(
      decodePurchaseCursor(Buffer.from(`|${ID}`).toString("base64url")),
    ).toBeNull();
  });
});
