import { z } from "zod";
import { parseConfig } from "../../config/parseConfig.ts";

export interface AnalyticsConfig {
  /** Null when no key is set — analytics capture then becomes a no-op. */
  apiKey: string | null;
  host: string;
}

export const ANALYTICS_CONFIG_TOKEN = "AnalyticsConfig";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

// Optional: PostHog's project key is public (write-only ingestion). Without it,
// analytics capture is a no-op and the server still boots.
const schema = z.object({
  apiKey: z.string().min(1).nullish().transform((v) => v ?? null),
  host: z.string().url().default(DEFAULT_POSTHOG_HOST),
});

export function loadAnalyticsConfig(): AnalyticsConfig {
  return parseConfig("analytics", schema, {
    // An empty string means unset (CI and e2e set it that way to disable
    // capture), so it degrades to the no-op client instead of failing min(1).
    apiKey: process.env.POSTHOG_API_KEY || undefined,
    host: process.env.POSTHOG_HOST,
  });
}
