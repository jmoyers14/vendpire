import { z } from "zod";
import { parseConfig } from "@vendpire/platform/server";
import type { MobileConfig } from "./mobileConfig.ts";

const schema = z.object({
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
