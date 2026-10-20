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

/** Drives the gate and records whether it refused or handed the request on. */
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

  it("serves a caller that sends no client header, like the web bundle", () => {
    const result = run(FLOOR, { url: "/visits.create" });

    expect(result.nextCalls).toBe(1);
  });

  it("never refuses the client-support endpoint itself — the wall needs it", () => {
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

  it("names where to update in the refusal body", () => {
    const result = run(FLOOR, { url: "/visits.create", clientHeader: "ios/42" });

    expect(result.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(result.body ?? "{}")).toMatchObject({
      error: { code: "UPGRADE_REQUIRED", updateUrl: FLOOR.iosUpdateUrl },
    });
  });
});
