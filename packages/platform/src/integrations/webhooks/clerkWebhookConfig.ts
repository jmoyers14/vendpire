import { z } from "zod";
import { parseConfig } from "../../config/parseConfig.ts";

/**
 * The Clerk webhook signing secret (`whsec_…` from the Clerk dashboard's
 * Webhooks page).
 *
 * Deliberately its OWN slice rather than a field on clerkConfig, even though
 * both are Clerk credentials. They're needed by different processes: the api
 * resolves clerkConfig for its secret key and never verifies a webhook, while
 * the worker verifies webhooks and never calls the Clerk API. Folding them
 * together would force each process to supply the other's secret — exactly the
 * all-or-nothing coupling the per-slice config split exists to prevent.
 */
export interface ClerkWebhookConfig {
  signingSecret: string;
}

export const CLERK_WEBHOOK_CONFIG_TOKEN = "ClerkWebhookConfig";

const schema = z.object({
  signingSecret: z
    .string()
    .min(1, "CLERK_WEBHOOK_SIGNING_SECRET is required to verify Clerk webhooks"),
});

export function loadClerkWebhookConfig(): ClerkWebhookConfig {
  return parseConfig("clerk webhook", schema, {
    signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  });
}
