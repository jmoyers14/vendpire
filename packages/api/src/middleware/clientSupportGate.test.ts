import { describe, expect, it } from "bun:test";
import { buildClientSupportGate } from "./clientSupportGate.ts";
import type { MobileClientSupportService } from "../services/MobileClientSupportService/MobileClientSupportService.ts";

const UPDATE_URL = "https://testflight.apple.com/join/abc123";

interface Captured {
  statusCode: number | null;
  headers: Record<string, string>;
  body: string | null;
  nextCalls: number;
}

/** A service that refuses whatever the test says it should. */
const stub = (refuses: boolean): MobileClientSupportService => ({
  updateUrl: UPDATE_URL,
  verdictFor: () => (refuses ? "required" : "none"),
  isUnsupportedRequest: () => refuses,
});

/** Drives the gate and records whether it refused or handed the request on. */
const run = (clientSupport: MobileClientSupportService): Captured => {
  const captured: Captured = {
    statusCode: null,
    headers: {},
    body: null,
    nextCalls: 0,
  };

  const req = { url: "/visits.create", headers: {} };

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

  buildClientSupportGate(clientSupport)(req, res, () => {
    captured.nextCalls += 1;
  });

  return captured;
};

describe("buildClientSupportGate", () => {
  it("refuses an unsupported client with 426", () => {
    const result = run(stub(true));

    expect(result.statusCode).toBe(426);
    expect(result.nextCalls).toBe(0);
  });

  it("hands a supported client onward untouched", () => {
    const result = run(stub(false));

    expect(result.statusCode).toBeNull();
    expect(result.nextCalls).toBe(1);
  });

  it("names where to update in the refusal body", () => {
    const result = run(stub(true));

    expect(result.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(result.body ?? "{}")).toMatchObject({
      error: { code: "UPGRADE_REQUIRED", updateUrl: UPDATE_URL },
    });
  });
});
