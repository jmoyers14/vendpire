/**
 * Transport-agnostic error raised by the service layer. The tRPC boundary maps
 * `code` onto a tRPC error code, so services can express domain failures
 * (not found, conflict, bad input) without importing anything from the
 * transport layer. The codes are deliberately a subset of tRPC's own codes so
 * the mapping is a direct passthrough.
 */
export type ServiceErrorCode = "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
