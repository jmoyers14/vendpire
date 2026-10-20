import { z } from "zod";
import { parseConfig } from "@vendpire/platform/server";
import type { MobileConfig } from "./mobileConfig.ts";

/**
 * Reads the iOS support floor from env. Kept apart from the `MobileConfig`
 * type so the type stays importable from `Context` — see the note in
 * `mobileConfig.ts`.
 */
const schema = z.object({
  // Both default to 0 so the mechanism ships dark: every already-deployed api
  // runs without these set, and a non-zero default would wall the field on the
  // next deploy. Raising them is a deliberate act, documented in DEPLOY.md.
  iosMinimumBuild: z.coerce.number().int().min(0).default(0),
  iosRecommendedBuild: z.coerce.number().int().min(0).default(0),
  iosUpdateUrl: z.string().url().default("https://apps.apple.com/app/vendpire"),
});

export function loadMobileConfig(): MobileConfig {
  return parseConfig("mobile", schema, {
    iosMinimumBuild: process.env.IOS_MINIMUM_BUILD,
    iosRecommendedBuild: process.env.IOS_RECOMMENDED_BUILD,
    iosUpdateUrl: process.env.IOS_UPDATE_URL,
  });
}
