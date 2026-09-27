import { inject, injectable } from "tsyringe";
import { PostHog } from "posthog-node";
import { ANALYTICS_CONFIG_TOKEN, type AnalyticsConfig } from "./analyticsConfig.ts";
import type { AnalyticsClient, AnalyticsEvent } from "./AnalyticsClient.ts";

/**
 * PostHog adapter for the AnalyticsClient port. The only file that knows about
 * the posthog-node SDK or holds the ingestion key. When no key is configured
 * the client is a no-op, so local dev and un-keyed deploys still boot.
 */
@injectable()
export class PostHogClient implements AnalyticsClient {
  private readonly client: PostHog | null;

  constructor(
    @inject(ANALYTICS_CONFIG_TOKEN)
    config: AnalyticsConfig,
  ) {
    const { apiKey, host } = config;
    // flushAt/flushInterval keep latency low on a long-lived server while still
    // batching: send after 20 events or 10s, whichever comes first.
    this.client = apiKey
      ? new PostHog(apiKey, { host, flushAt: 20, flushInterval: 10_000 })
      : null;
  }

  capture({ event, distinctId, groupId, properties }: AnalyticsEvent): void {
    this.client?.capture({
      distinctId,
      event,
      properties,
      groups: groupId ? { organization: groupId } : undefined,
    });
  }

  async shutdown(): Promise<void> {
    await this.client?._shutdown();
  }
}
