import { describe, expect, it } from "bun:test";
import type { AnalyticsEvent } from "@vendpire/platform";
import { systemRouter } from "./system.ts";
import type { Context } from "../context.ts";
import type { MobileConfig } from "../config/mobileConfig.ts";
import { MobileClientSupportServiceImpl } from "../services/MobileClientSupportService/MobileClientSupportServiceImpl.ts";

const INERT: MobileConfig = {
  iosMinimumBuild: 0,
  iosRecommendedBuild: 0,
  iosUpdateUrl: "https://apps.apple.com/app/vendpire",
};

/** A context carrying only what `clientSupport` touches. */
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
  log: {} as Context["log"],
  services: {
    ...({} as Context["services"]),
    mobileClientSupportService: new MobileClientSupportServiceImpl(mobileConfig),
  },
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

  it("answers a caller with no authentication at all — the wall needs it to", async () => {
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
