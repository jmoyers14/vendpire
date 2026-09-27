import pino from "pino";
import type { Logger } from "./Logger.ts";

/**
 * The GCP-shaped pino options. Cloud Run scrapes stdout into Cloud Logging and
 * parses structured JSON natively, so the whole job here is to speak its schema:
 *  - `severity` (not pino's numeric `level`) is the field Cloud Logging reads for
 *    log level, so map the level label onto it;
 *  - `message` (not pino's default `msg`) is the field it shows as the summary.
 * Emitting JSON to stdout also fixes stack-trace line fragmentation and enables
 * field-based search. Level is env-tunable; default `info`.
 */
export const pinoOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  messageKey: "message",
  formatters: {
    level: (label) => ({ severity: label.toUpperCase() }),
  },
  // Serialize an `err` binding into { type, message, stack } so a logged error
  // carries its stack trace — what Cloud Logging shows and Error Reporting groups
  // on. Usage: log.error({ err }, "message").
  serializers: { err: pino.stdSerializers.err },
  // Drop pid/hostname — Cloud Run attaches its own resource labels, so these are
  // just noise per line.
  base: undefined,
};

/**
 * Wraps a pino instance as our Logger port. A thin adapter (rather than casting
 * the pino instance) keeps our surface to exactly the methods declared on Logger
 * and makes `child` return a Logger, not a pino type.
 */
function adapt(instance: pino.Logger): Logger {
  return {
    debug: instance.debug.bind(instance) as Logger["debug"],
    info: instance.info.bind(instance) as Logger["info"],
    warn: instance.warn.bind(instance) as Logger["warn"],
    error: instance.error.bind(instance) as Logger["error"],
    fatal: instance.fatal.bind(instance) as Logger["fatal"],
    child: (bindings) => adapt(instance.child(bindings)),
  };
}

/**
 * The process-wide root logger. Entrypoints log boot/shutdown through it and
 * derive request/job-scoped children via `.child(...)`. Registered under
 * LOGGER_TOKEN by registerServerCore for injection into services and adapters.
 */
export const rootLogger: Logger = adapt(pino(pinoOptions));
