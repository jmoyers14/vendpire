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

  // The floor is inclusive: a build *equal* to the minimum is supported. Off by
  // one here strands the exact build we just told everyone to install.
  it("treats a build equal to the minimum as supported", () => {
    expect(
      updateRequirementFor({ build: 43, minimumBuild: 43, recommendedBuild: 43 }),
    ).toBe("none");
  });

  // The whole feature ships dark behind a floor of 0 and stays inert until
  // someone deliberately sets the env var. If this ever returns anything but
  // "none", deploying the server walls every client in the field at once.
  it("is inert at the default floor of 0", () => {
    expect(
      updateRequirementFor({ build: 1, minimumBuild: 0, recommendedBuild: 0 }),
    ).toBe("none");
  });

  // "required" is strictly worse news than "recommended", so it must win.
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

  // The web app sends no such header. Returning null (rather than a zero build)
  // is what keeps the gate from walling every browser request.
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

  // Node hands back an array when a header arrives more than once.
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

  // A client stuck behind the wall still has to be able to ask *why*. Gating
  // this path makes the verdict unreachable for exactly the clients that need
  // it, and the wall silently never appears.
  it("never gates the client-support endpoint itself", () => {
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

  // The web bundle and the e2e health check both send bare requests. A blanket
  // gate on every unidentified caller takes down both.
  it("serves callers that send no client header", () => {
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

  // Only "required" is a refusal. A recommended nudge must still be served, or
  // the safety valve becomes a second wall.
  it("serves a build that is merely behind the recommended number", () => {
    expect(
      isUnsupportedClient({ header: "ios/45", path: "/visits.create", ...FLOOR }),
    ).toBe(false);
  });
});
