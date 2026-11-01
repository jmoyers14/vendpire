/**
 * Transport-agnostic error raised by the service layer. The tRPC boundary maps
 * `code` onto a tRPC error code, so services can express domain failures
 * (not found, conflict, bad input) without importing anything from the
 * transport layer. The codes are deliberately a subset of tRPC's own codes so
 * the mapping is a direct passthrough.
 */
export type ServiceErrorCode = "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";

/**
 * Mongo's duplicate-key error, recognized without importing a driver type.
 * Every client-request-id'd write races the same way: pre-read, create, and
 * fall back to a re-read when the unique index rejects the second writer.
 */
export const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
