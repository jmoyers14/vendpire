import { afterEach, describe, expect, it } from "bun:test";
import { loadMobileConfig } from "./loadMobileConfig.ts";

const KEYS = ["IOS_MINIMUM_BUILD", "IOS_RECOMMENDED_BUILD", "IOS_UPDATE_URL"];

afterEach(() => {
  for (const key of KEYS) {
    delete process.env[key];
  }
});

describe("loadMobileConfig", () => {
  it("coerces the floor from the string env vars actually give it", () => {
    process.env.IOS_MINIMUM_BUILD = "43";
    process.env.IOS_RECOMMENDED_BUILD = "50";

    const config = loadMobileConfig();

    expect(config.iosMinimumBuild).toBe(43);
    expect(config.iosRecommendedBuild).toBe(50);
  });

  it("defaults both floors to 0 so an unconfigured api stays inert", () => {
    const config = loadMobileConfig();

    expect(config.iosMinimumBuild).toBe(0);
    expect(config.iosRecommendedBuild).toBe(0);
  });

  it("carries an update url so the wall always has somewhere to send people", () => {
    process.env.IOS_UPDATE_URL = "https://testflight.apple.com/join/abc123";

    expect(loadMobileConfig().iosUpdateUrl).toBe(
      "https://testflight.apple.com/join/abc123",
    );
  });
});
