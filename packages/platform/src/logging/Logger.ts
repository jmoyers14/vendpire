/**
 * The app's logging surface — a vendor-neutral port, exactly like the other
 * integration ports. pino implements it (see pinoLogger.ts), but that stays
 * server-only: this interface is what rides on the tRPC Context, so the web
 * client's type graph reaches only this, never pino.
 *
 * Two call forms per level, mirroring pino: a bare message, or a bindings object
 * plus a message. Bindings are structured fields Cloud Logging can filter on
 * (`jsonPayload.orgId = "…"`), so prefer `log.error({ orgId, code }, "…")` over
 * interpolating values into the message string.
 */
export interface LogFn {
  (message: string): void;
  (bindings: Record<string, unknown>, message: string): void;
}

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  /** Unrecoverable — a crashing process. Reserve for global handlers. */
  fatal: LogFn;
  /**
   * A logger that stamps `bindings` onto every line. Used for request-scoped
   * (requestId/orgId/userId) and job-scoped (jobType/sourceEventId) children so a
   * unit of work's logs correlate.
   */
  child(bindings: Record<string, unknown>): Logger;
}

export const LOGGER_TOKEN = "Logger";
