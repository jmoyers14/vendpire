import { describe, expect, it } from "bun:test";
import type { AnalyticsEvent } from "@vendpire/platform";
import { systemRouter } from "./system.ts";
import type { Context } from "../context.ts";
import type { MobileConfig } from "../config/mobileConfig.ts";

const INERT: MobileConfig = {
  iosMinimumBuild: 0,
  iosRecommendedBuild: 0,
  iosUpdateUrl: "https://apps.apple.com/app/vendpire",
};

/**
 * A context carrying only what `clientSupport` touches. The services bag and
 * the app stamp are cast rather than faked — a fake would assert this procedure
 * depends on them, and the point is that it doesn't.
 */
const buildContext = (
  mobileConfig: MobileConfig,
  captured: AnalyticsEvent[] = [],
): Context => ({
  auth: null,
  analytics: {
    capture: (event) => {
      captured.push(event);
    },
    shutdown: async () => {},
  },
  appConfig: {} as Context["appConfig"],
  mobileConfig,
  log: {} as Context["log"],
  services: {} as Context["services"],
});

describe("system.clientSupport", () => {
  it("asks for nothing when the build is current", async () => {
    const caller = systemRouter.createCaller(
      buildContext({ ...INERT, iosMinimumBuild: 43, iosRecommendedBuild: 50 }),
    );

    const result = await caller.clientSupport({ platform: "ios", build: 50 });

    expect(result.updateRequirement).toBe("none");
  });

  it("recommends an update for a build behind the recommended number", async () => {
    const caller = systemRouter.createCaller(
      buildContext({ ...INERT, iosMinimumBuild: 43, iosRecommendedBuild: 50 }),
    );

    const result = await caller.clientSupport({ platform: "ios", build: 45 });

    expect(result.updateRequirement).toBe("recommended");
  });

  it("requires an update for a build below the floor", async () => {
    const caller = systemRouter.createCaller(
      buildContext({ ...INERT, iosMinimumBuild: 43, iosRecommendedBuild: 50 }),
    );

    const result = await caller.clientSupport({ platform: "ios", build: 42 });

    expect(result.updateRequirement).toBe("required");
  });

  // The single most important property of this endpoint. A blocked client is
  // very likely also holding an expired session, so a wall that needs a valid
  // token to appear is a wall that never appears — silently. If someone moves
  // this onto orgProtectedProcedure, the null auth below throws and this fails.
  it("answers a caller with no authentication at all", async () => {
    const context = buildContext({ ...INERT, iosMinimumBuild: 43 });
    expect(context.auth).toBeNull();

    const result = await systemRouter
      .createCaller(context)
      .clientSupport({ platform: "ios", build: 42 });

    expect(result.updateRequirement).toBe("required");
  });

  it("hands back the update url so the wall has somewhere to send people", async () => {
    const caller = systemRouter.createCaller(
      buildContext({
        ...INERT,
        iosMinimumBuild: 43,
        iosUpdateUrl: "https://testflight.apple.com/join/abc123",
      }),
    );

    const result = await caller.clientSupport({ platform: "ios", build: 42 });

    expect(result.updateUrl).toBe("https://testflight.apple.com/join/abc123");
  });

  it("stays inert at the default floor", async () => {
    const caller = systemRouter.createCaller(buildContext(INERT));

    const result = await caller.clientSupport({ platform: "ios", build: 1 });

    expect(result.updateRequirement).toBe("none");
  });
});

describe("system.clientSupport analytics", () => {
  // This count is the whole safety mechanism for raising the floor: without it
  // you are guessing at how many users a bump would strand.
  it("records a stale client, with the build you would filter on", async () => {
    const captured: AnalyticsEvent[] = [];
    const caller = systemRouter.createCaller(
      buildContext(
        { ...INERT, iosMinimumBuild: 43, iosRecommendedBuild: 50 },
        captured,
      ),
    );

    await caller.clientSupport({ platform: "ios", build: 42 });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.event).toBe("stale_client.detected");
    expect(captured[0]?.properties).toMatchObject({
      platform: "ios",
      build: 42,
      updateRequirement: "required",
    });
  });

  // Raising RECOMMENDED first and watching this count fall is the documented
  // procedure, so a merely-nudged client has to show up in it too.
  it("records a client that is only behind the recommended number", async () => {
    const captured: AnalyticsEvent[] = [];
    const caller = systemRouter.createCaller(
      buildContext(
        { ...INERT, iosMinimumBuild: 43, iosRecommendedBuild: 50 },
        captured,
      ),
    );

    await caller.clientSupport({ platform: "ios", build: 45 });

    expect(captured[0]?.properties).toMatchObject({
      updateRequirement: "recommended",
    });
  });

  it("records nothing for a current build, so the count means what it says", async () => {
    const captured: AnalyticsEvent[] = [];
    const caller = systemRouter.createCaller(
      buildContext(
        { ...INERT, iosMinimumBuild: 43, iosRecommendedBuild: 50 },
        captured,
      ),
    );

    await caller.clientSupport({ platform: "ios", build: 50 });

    expect(captured).toHaveLength(0);
  });
});
