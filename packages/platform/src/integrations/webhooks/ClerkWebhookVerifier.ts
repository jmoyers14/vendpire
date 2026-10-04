import { verifyWebhook } from "@clerk/backend/webhooks";
import { inject, injectable } from "tsyringe";
import {
  CLERK_WEBHOOK_CONFIG_TOKEN,
  type ClerkWebhookConfig,
} from "./clerkWebhookConfig.ts";
import type { VerifiedWebhook, WebhookVerifier } from "./WebhookVerifier.ts";

/** Standard Webhooks puts the unique delivery id in this header. */
const DELIVERY_ID_HEADER = "svix-id";

/**
 * Clerk adapter for the WebhookVerifier port. The only file that knows Clerk
 * signs with Standard Webhooks, or which headers carry the signature.
 *
 * Uses the SDK's own `verifyWebhook` rather than reimplementing the HMAC check
 * against the `svix` library directly: signature verification is security code
 * where the vendor's implementation is the one that stays correct as the scheme
 * evolves. It also means no extra runtime dependency — `@clerk/backend` already
 * brings `standardwebhooks` in.
 */
@injectable()
export class ClerkWebhookVerifier implements WebhookVerifier {
  constructor(
    @inject(CLERK_WEBHOOK_CONFIG_TOKEN)
    private readonly config: ClerkWebhookConfig,
  ) {}

  async verify(request: Request): Promise<VerifiedWebhook | null> {
    // The delivery id is read BEFORE verification only because it lives in a
    // header the signature itself covers — if the id were tampered with, the
    // verify below fails and we discard everything anyway.
    const sourceEventId = request.headers.get(DELIVERY_ID_HEADER);
    if (!sourceEventId) {
      return null;
    }

    try {
      // Consumes the request body. Clerk's helper reads the raw bytes itself,
      // which is why the port insists on an unread Request.
      const event = await verifyWebhook(request, {
        signingSecret: this.config.signingSecret,
      });

      return {
        sourceEventId,
        type: event.type,
        // `event.data` only — the envelope's `object`/`event_attributes` are
        // transport noise. Handlers care about the entity that changed.
        payload: event.data,
      };
    } catch {
      // A bad signature is routine on a public endpoint (scanners, replays,
      // a rotated secret). Null, not throw — the caller turns it into a 400.
      return null;
    }
  }
}
