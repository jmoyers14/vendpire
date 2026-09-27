import { describe, expect, it } from "bun:test";
import pino from "pino";
import { pinoOptions } from "./pinoLogger.ts";

/**
 * Captures one emitted log line as a parsed object. Uses pino's own stream sink
 * with the real options, so the test exercises the actual GCP-shaping — the
 * severity/message mapping Cloud Logging depends on — not a reimplementation.
 */
const capture = (write: (log: pino.Logger) => void): Record<string, unknown> => {
  let line = "";
  const stream = { write: (chunk: string) => { line += chunk; } };
  write(pino({ ...pinoOptions, level: "debug" }, stream));
  return JSON.parse(line);
};

describe("pinoOptions (GCP shaping)", () => {
  it("maps the level to a GCP `severity` field, not pino's numeric level", () => {
    const log = capture((l) => l.error("boom"));
    expect(log.severity).toBe("ERROR");
    expect(log.level).toBeUndefined();
  });

  it("uses `message` as the message key", () => {
    const log = capture((l) => l.info("hello"));
    expect(log.message).toBe("hello");
    expect(log.msg).toBeUndefined();
  });

  it("includes structured bindings as top-level fields for filtering", () => {
    const log = capture((l) => l.warn({ orgId: "org_1", code: "X" }, "warned"));
    expect(log.orgId).toBe("org_1");
    expect(log.code).toBe("X");
    expect(log.severity).toBe("WARN");
  });

  it("drops pid/hostname noise", () => {
    const log = capture((l) => l.info("x"));
    expect(log.pid).toBeUndefined();
    expect(log.hostname).toBeUndefined();
  });
});
