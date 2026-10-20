import { describe, expect, it } from "bun:test";
import { MobileClientSupportServiceImpl } from "./MobileClientSupportServiceImpl.ts";
import type { MobileConfig } from "../../config/mobileConfig.ts";

const FLOOR: MobileConfig = {
  iosMinimumBuild: 43,
  iosRecommendedBuild: 50,
  iosUpdateUrl: "https://testflight.apple.com/join/abc123",
};

const build = (over: Partial<MobileConfig> = {}) =>
  new MobileClientSupportServiceImpl({ ...FLOOR, ...over });

describe("verdictFor", () => {
  it("requires an update below the minimum build", () => {
    expect(build().verdictFor(42)).toBe("required");
  });

  it("recommends an update below the recommended build but at the minimum", () => {
    expect(build().verdictFor(43)).toBe("recommended");
  });

  it("asks for nothing at or above both numbers", () => {
    expect(build().verdictFor(50)).toBe("none");
  });

  it("treats a build equal to the minimum as supported", () => {
    expect(build({ iosRecommendedBuild: 43 }).verdictFor(43)).toBe("none");
  });

  it("is inert at the default floor of 0 — an unconfigured api walls nobody", () => {
    const service = build({ iosMinimumBuild: 0, iosRecommendedBuild: 0 });
    expect(service.verdictFor(1)).toBe("none");
  });

  it("reports required, not recommended, when the build is below both", () => {
    expect(build().verdictFor(10)).toBe("required");
  });
});

describe("updateUrl", () => {
  it("carries the configured destination", () => {
    expect(build().updateUrl).toBe(FLOOR.iosUpdateUrl);
  });
});

describe("isUnsupportedRequest", () => {
  const ask = (header: string | string[] | undefined, path = "/visits.create") =>
    build().isUnsupportedRequest({ header, path });

  it("refuses an iOS build below the floor", () => {
    expect(ask("ios/42")).toBe(true);
  });

  it("serves a build at the floor", () => {
    expect(ask("ios/43")).toBe(false);
  });

  it("serves a build that is merely behind the recommended number", () => {
    expect(ask("ios/45")).toBe(false);
  });

  it("serves callers that send no client header, like the web bundle", () => {
    expect(ask(undefined)).toBe(false);
  });

  it("serves a platform we have no policy for", () => {
    expect(ask("android/42")).toBe(false);
  });

  it("serves a non-numeric build rather than guessing at it", () => {
    expect(ask("ios/beta")).toBe(false);
  });

  it("serves a marketing version, which is not a build number", () => {
    expect(ask("ios/1.10.0")).toBe(false);
  });

  it("serves a stamp with no separator", () => {
    expect(ask("ios")).toBe(false);
  });

  it("reads the first value when the header arrives repeated", () => {
    expect(ask(["ios/42", "ios/99"])).toBe(true);
  });

  it("is inert at the default floor of 0", () => {
    const service = build({ iosMinimumBuild: 0, iosRecommendedBuild: 0 });
    expect(service.isUnsupportedRequest({ header: "ios/1", path: "/visits.create" })).toBe(
      false,
    );
  });

  it("never gates the client-support endpoint itself — the wall needs it", () => {
    expect(ask("ios/42", "/system.clientSupport")).toBe(false);
  });

  it("never gates the version stamp", () => {
    expect(ask("ios/42", "/system.version")).toBe(false);
  });
});

describe("isUnsupportedRequest — batched requests", () => {
  const ask = (path: string) =>
    build().isUnsupportedRequest({ header: "ios/42", path });

  it("refuses a batch that smuggles a gated procedure behind a system call", () => {
    expect(ask("/system.version,visits.create")).toBe(true);
  });

  it("refuses a batch whose gated procedure comes first", () => {
    expect(ask("/visits.create,system.version")).toBe(true);
  });

  it("serves a batch made up entirely of system calls", () => {
    expect(ask("/system.clientSupport,system.version")).toBe(false);
  });

  it("ignores the query string, whose batched input contains commas", () => {
    expect(
      ask('/system.clientSupport,system.version?batch=1&input={"0":{"platform":"ios","build":42},"1":{}}'),
    ).toBe(false);
  });

  it("still refuses a plain single gated procedure", () => {
    expect(ask("/visits.create")).toBe(true);
  });
});
