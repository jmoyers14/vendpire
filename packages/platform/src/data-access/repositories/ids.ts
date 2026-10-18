import type { Types } from "mongoose";

/**
 * An ObjectId as the plain string the domain layer speaks.
 *
 * Overloaded on the argument rather than the return type, so a required path
 * yields `string` and a nullable one `string | null` while both call sites read
 * the same. Exists instead of a bare `String(...)` because `String(null)` is
 * the string `"null"` — which typechecks, passes every existing test, and
 * silently poisons `templateId`, `planogramId` and `packId`.
 */
export function toId(value: Types.ObjectId): string;
export function toId(value: Types.ObjectId | null | undefined): string | null;
export function toId(value: Types.ObjectId | null | undefined): string | null {
  return value ? value.toHexString() : null;
}
