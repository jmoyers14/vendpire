import { describe, expect, it } from "bun:test";
import { buildClientSupportGate } from "./clientSupportGate.ts";
import type { MobileConfig } from "../config/mobileConfig.ts";

const FLOOR: MobileConfig = {
  iosMinimumBuild: 43,
  iosRecommendedBuild: 50,
  iosUpdateUrl: "https://testflight.apple.com/join/abc123",
};

interface Captured {
  statusCode: number | null;
  headers: Record<string, string>;
  body: string | null;
  nextCalls: number;
}

/**
 * Drives the gate with a bare request and records what it did — whether it
 * wrote a refusal, or handed the request onward.
 */
const run = (
  config: MobileConfig,
  request: { url: string; clientHeader?: string },
): Captured => {
  const captured: Captured = {
    statusCode: null,
    headers: {},
    body: null,
    nextCalls: 0,
  };

  const req = {
    url: request.url,
    headers:
      request.clientHeader === undefined
        ? {}
        : { "x-vendpire-client": request.clientHeader },
  };

  const res = {
    setHeader: (name: string, value: string) => {
      captured.headers[name.toLowerCase()] = value;
    },
    end: (body?: string) => {
      captured.body = body ?? null;
    },
    set statusCode(code: number) {
      captured.statusCode = code;
    },
    get statusCode() {
      return captured.statusCode ?? 200;
    },
  };

  buildClientSupportGate(config)(req, res, () => {
    captured.nextCalls += 1;
  });

  return captured;
};

describe("buildClientSupportGate", () => {
  it("refuses a build below the floor with 426", () => {
    const result = run(FLOOR, { url: "/visits.create", clientHeader: "ios/42" });

    expect(result.statusCode).toBe(426);
    expect(result.nextCalls).toBe(0);
  });

  it("serves a build at the floor", () => {
    const result = run(FLOOR, { url: "/visits.create", clientHeader: "ios/43" });

    expect(result.statusCode).toBeNull();
    expect(result.nextCalls).toBe(1);
  });

  // The web bundle sends no client header, and neither does the e2e health
  // check. A gate that refused unidentified callers would take down both.
  it("serves a caller that sends no client header", () => {
    const result = run(FLOOR, { url: "/visits.create" });

    expect(result.nextCalls).toBe(1);
  });

  // Without this the wall can never render: the refused client cannot reach the
  // one endpoint that would tell it why it was refused.
  it("never refuses the client-support endpoint itself", () => {
    const result = run(FLOOR, {
      url: "/system.clientSupport?batch=1",
      clientHeader: "ios/42",
    });

    expect(result.nextCalls).toBe(1);
  });

  it("never refuses the version stamp, query string and all", () => {
    const result = run(FLOOR, {
      url: "/system.version?batch=1",
      clientHeader: "ios/42",
    });

    expect(result.nextCalls).toBe(1);
  });

  it("is inert at the default floor", () => {
    const result = run(
      { ...FLOOR, iosMinimumBuild: 0, iosRecommendedBuild: 0 },
      { url: "/visits.create", clientHeader: "ios/1" },
    );

    expect(result.nextCalls).toBe(1);
  });

  // The backstop fires when the launch check never happened, so the refusal
  // has to carry the destination itself rather than assume the client has it.
  it("names where to update in the refusal body", () => {
    const result = run(FLOOR, { url: "/visits.create", clientHeader: "ios/42" });

    expect(result.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(result.body ?? "{}")).toMatchObject({
      error: { code: "UPGRADE_REQUIRED", updateUrl: FLOOR.iosUpdateUrl },
    });
  });
});
