import { z } from "zod";

/**
 * A document id, as the client sends it.
 *
 * Every id path in the schemas is an ObjectId, so a value that isn't 24-hex
 * raises a Mongoose CastError on the way to Mongo — a 500 for what is squarely
 * a bad request. Validating the shape here turns that into a 400, and closes
 * the hole where a malformed foreign key used to store silently back when these
 * paths were plain strings.
 *
 * Not for `clientRequestId` or `cardReader.deviceId`: those are client- and
 * vendor-minted, and have nothing to do with an `_id`.
 */
export const objectId = () =>
  z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex id");
