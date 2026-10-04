/**
 * A webhook that has been proven to come from the provider it claims to.
 * Producing one of these is the ONLY way to get past the verification boundary —
 * nothing downstream should ever construct one from an unverified request.
 */
export interface VerifiedWebhook {
  /**
   * The provider's id for this delivery — the `svix-id` header for Clerk. Named
   * to match the persisted field it feeds: it is the source's id, never a local
   * row id.
   */
  sourceEventId: string;
  /** The provider's event name, e.g. "organization.created". */
  type: string;
  /** The parsed body. Still `unknown`: verified authorship is not a schema. */
  payload: unknown;
}

/**
 * Port for checking that an inbound webhook really came from its claimed sender.
 *
 * One implementation per source, because signing schemes don't generalize —
 * Clerk signs with Standard Webhooks, and another provider would bring its own
 * algorithm, header names, and secret. That's the reason the source is named in
 * the route path: the right verifier has to be chosen before anything is trusted.
 *
 * Takes the whole `Request`, unread. A signature covers the exact received byte
 * sequence AND several headers, so the adapter needs both — and the body must
 * still be unconsumed, since a Request body can only be read once. Callers must
 * pass the request straight through without awaiting `.text()`/`.json()` first.
 *
 * Returns null when verification fails, matching AuthClient's convention — a bad
 * signature is an expected condition on a public endpoint, not an exceptional
 * one. Callers must treat null as "reject and do not persist".
 */
export interface WebhookVerifier {
  verify(request: Request): Promise<VerifiedWebhook | null>;
}
