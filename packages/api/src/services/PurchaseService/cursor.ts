import type { PurchaseCursor } from "@vendpire/platform";

/**
 * The purchases list cursor, opaque on the wire.
 *
 * It encodes the PAIR the keyset sorts on — (purchasedAt, id) — because
 * purchasedAt is not unique. base64url so it survives a query string
 * unescaped, and so nobody is tempted to hand-build one.
 *
 * Lives in the service rather than the repository: the opaque string is part
 * of the API contract, while the repository deals in the structured position.
 */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export const encodePurchaseCursor = (cursor: PurchaseCursor): string =>
  Buffer.from(`${cursor.purchasedAt}|${cursor.id}`, "utf8").toString("base64url");

/** Null for anything we didn't mint — callers turn that into a 400. */
export const decodePurchaseCursor = (raw: string): PurchaseCursor | null => {
  // Buffer.from(..., "base64url") never throws; it silently drops junk. The
  // checks below are what actually reject a hand-edited cursor.
  const parts = Buffer.from(raw, "base64url").toString("utf8").split("|");
  if (parts.length !== 2) {
    return null;
  }
  const [purchasedAt, id] = parts;
  // The 24-hex guard is load-bearing: it is what lets the repository hand the
  // id to Mongo as a plain string without risking a CastError (a 500).
  if (!purchasedAt || !id || !OBJECT_ID.test(id)) {
    return null;
  }
  if (Number.isNaN(Date.parse(purchasedAt))) {
    return null;
  }
  return { purchasedAt, id };
};
