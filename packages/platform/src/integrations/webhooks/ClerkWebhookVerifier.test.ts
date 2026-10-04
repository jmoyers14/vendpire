import { describe, expect, it } from "bun:test";
import { Webhook } from "standardwebhooks";
import { ClerkWebhookVerifier } from "./ClerkWebhookVerifier.ts";

/**
 * Signatures are produced by the real Standard Webhooks library rather than
 * hand-rolled, so these tests check the adapter against the actual scheme
 * instead of against our understanding of it.
 */
const SIGNING_SECRET = Buffer.from("a-test-signing-secret-32-bytes!!").toString(
  "base64",
);

const body = JSON.stringify({
  type: "organization.created",
  object: "event",
  data: { id: "org_123", name: "Moyers Vending" },
});

const signedRequest = (
  options: {
    id?: string;
    secret?: string;
    payload?: string;
    omitIdHeader?: boolean;
    timestamp?: Date;
  } = {},
): Request => {
  const id = options.id ?? "msg_2abc";
  const timestamp = options.timestamp ?? new Date();
  const payload = options.payload ?? body;
  const signature = new Webhook(options.secret ?? SIGNING_SECRET).sign(
    id,
    timestamp,
    payload,
  );

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
    "svix-signature": signature,
  };
  if (!options.omitIdHeader) {
    headers["svix-id"] = id;
  }

  return new Request("https://worker.local/ingest/clerk", {
    method: "POST",
    headers,
    body: payload,
  });
};

const verifier = (): ClerkWebhookVerifier =>
  new ClerkWebhookVerifier({ signingSecret: SIGNING_SECRET });

describe("ClerkWebhookVerifier", () => {
  it("accepts a correctly signed webhook", async () => {
    const result = await verifier().verify(signedRequest());

    expect(result).not.toBeNull();
    expect(result?.type).toBe("organization.created");
    expect(result?.sourceEventId).toBe("msg_2abc");
  });

  it("returns the entity data as the payload, not the envelope", async () => {
    const result = await verifier().verify(signedRequest());

    // Handlers care about the org that changed, not `object`/`event_attributes`.
    expect(result?.payload).toEqual({ id: "org_123", name: "Moyers Vending" });
  });

  it("takes sourceEventId from the svix-id header", async () => {
    const result = await verifier().verify(signedRequest({ id: "msg_different" }));

    expect(result?.sourceEventId).toBe("msg_different");
  });

  it("rejects a webhook signed with the wrong secret", async () => {
    const wrongSecret = Buffer.from("a-different-secret-of-32-bytes!!").toString(
      "base64",
    );

    const result = await verifier().verify(signedRequest({ secret: wrongSecret }));

    expect(result).toBeNull();
  });

  it("rejects a tampered body whose signature no longer matches", async () => {
    // Sign the real body, then swap the body out — the classic replay-with-edits
    // attack. This is the case the whole verification step exists to stop.
    const authentic = signedRequest();
    const tampered = new Request(authentic.url, {
      method: "POST",
      headers: authentic.headers,
      body: JSON.stringify({
        type: "organization.created",
        object: "event",
        data: { id: "org_ATTACKER", name: "Evil" },
      }),
    });

    const result = await verifier().verify(tampered);

    expect(result).toBeNull();
  });

  it("rejects a request with no signature headers at all", async () => {
    const unsigned = new Request("https://worker.local/ingest/clerk", {
      method: "POST",
      headers: { "content-type": "application/json", "svix-id": "msg_2abc" },
      body,
    });

    const result = await verifier().verify(unsigned);

    expect(result).toBeNull();
  });

  it("rejects a request missing the svix-id header", async () => {
    const result = await verifier().verify(signedRequest({ omitIdHeader: true }));

    expect(result).toBeNull();
  });

  it("rejects a stale timestamp, so an old delivery can't be replayed", async () => {
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await verifier().verify(signedRequest({ timestamp: longAgo }));

    expect(result).toBeNull();
  });
});
