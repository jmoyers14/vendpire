import { describe, expect, it } from "bun:test";
import {
  isUnsupportedClient,
  parseClientHeader,
  updateRequirementFor,
} from "./clientSupport.ts";

describe("updateRequirementFor", () => {
  it("requires an update below the minimum build", () => {
    expect(
      updateRequirementFor({ build: 42, minimumBuild: 43, recommendedBuild: 43 }),
    ).toBe("required");
  });

  it("recommends an update below the recommended build but at the minimum", () => {
    expect(
      updateRequirementFor({ build: 43, minimumBuild: 43, recommendedBuild: 50 }),
    ).toBe("recommended");
  });

  it("asks for nothing at or above both numbers", () => {
    expect(
      updateRequirementFor({ build: 50, minimumBuild: 43, recommendedBuild: 50 }),
    ).toBe("none");
  });

  it("treats a build equal to the minimum as supported", () => {
    expect(
      updateRequirementFor({ build: 43, minimumBuild: 43, recommendedBuild: 43 }),
    ).toBe("none");
  });

  it("is inert at the default floor of 0 — an unconfigured api walls nobody", () => {
    expect(
      updateRequirementFor({ build: 1, minimumBuild: 0, recommendedBuild: 0 }),
    ).toBe("none");
  });

  it("reports required, not recommended, when the build is below both", () => {
    expect(
      updateRequirementFor({ build: 10, minimumBuild: 43, recommendedBuild: 50 }),
    ).toBe("required");
  });
});

describe("parseClientHeader", () => {
  it("parses an iOS build stamp", () => {
    expect(parseClientHeader("ios/42")).toEqual({ platform: "ios", build: 42 });
  });

  it("returns null when the header is absent", () => {
    expect(parseClientHeader(undefined)).toBeNull();
  });

  it("returns null for a platform we have no policy for", () => {
    expect(parseClientHeader("android/42")).toBeNull();
  });

  it("returns null for a non-numeric build", () => {
    expect(parseClientHeader("ios/beta")).toBeNull();
  });

  it("returns null for a marketing version, which is not a build number", () => {
    expect(parseClientHeader("ios/1.10.0")).toBeNull();
  });

  it("returns null when the separator is missing", () => {
    expect(parseClientHeader("ios")).toBeNull();
  });

  it("reads the first value when the header arrives repeated", () => {
    expect(parseClientHeader(["ios/42", "ios/99"])).toEqual({
      platform: "ios",
      build: 42,
    });
  });
});

describe("isUnsupportedClient", () => {
  const FLOOR = { minimumBuild: 43, recommendedBuild: 50 };

  it("refuses an iOS build below the floor", () => {
    expect(
      isUnsupportedClient({ header: "ios/42", path: "/visits.create", ...FLOOR }),
    ).toBe(true);
  });

  it("serves a build at the floor", () => {
    expect(
      isUnsupportedClient({ header: "ios/43", path: "/visits.create", ...FLOOR }),
    ).toBe(false);
  });

  it("never gates the client-support endpoint itself — the wall needs it", () => {
    expect(
      isUnsupportedClient({
        header: "ios/42",
        path: "/system.clientSupport",
        ...FLOOR,
      }),
    ).toBe(false);
  });

  it("never gates the version stamp", () => {
    expect(
      isUnsupportedClient({ header: "ios/42", path: "/system.version", ...FLOOR }),
    ).toBe(false);
  });

  it("serves callers that send no client header, like the web bundle", () => {
    expect(
      isUnsupportedClient({ header: undefined, path: "/visits.create", ...FLOOR }),
    ).toBe(false);
  });

  it("is inert at the default floor of 0", () => {
    expect(
      isUnsupportedClient({
        header: "ios/1",
        path: "/visits.create",
        minimumBuild: 0,
        recommendedBuild: 0,
      }),
    ).toBe(false);
  });

  it("serves a build that is merely behind the recommended number", () => {
    expect(
      isUnsupportedClient({ header: "ios/45", path: "/visits.create", ...FLOOR }),
    ).toBe(false);
  });
});

describe("isUnsupportedClient — batched requests", () => {
  const FLOOR = { minimumBuild: 43, recommendedBuild: 50 };

  it("refuses a batch that smuggles a gated procedure behind a system call", () => {
    expect(
      isUnsupportedClient({
        header: "ios/42",
        path: "/system.version,visits.create",
        ...FLOOR,
      }),
    ).toBe(true);
  });

  it("refuses a batch whose gated procedure comes first", () => {
    expect(
      isUnsupportedClient({
        header: "ios/42",
        path: "/visits.create,system.version",
        ...FLOOR,
      }),
    ).toBe(true);
  });

  it("serves a batch made up entirely of system calls", () => {
    expect(
      isUnsupportedClient({
        header: "ios/42",
        path: "/system.clientSupport,system.version",
        ...FLOOR,
      }),
    ).toBe(false);
  });

  it("ignores the query string, whose batched input contains commas", () => {
    expect(
      isUnsupportedClient({
        header: "ios/42",
        path: '/system.clientSupport,system.version?batch=1&input={"0":{"platform":"ios","build":42},"1":{}}',
        ...FLOOR,
      }),
    ).toBe(false);
  });

  it("still refuses a plain single gated procedure", () => {
    expect(
      isUnsupportedClient({ header: "ios/42", path: "/visits.create", ...FLOOR }),
    ).toBe(true);
  });
});
