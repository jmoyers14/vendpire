/**
 * Vendor-neutral identity returned by an auth provider after verifying a
 * session token. Free of any SDK types — this is the shape the rest of the app
 * speaks, regardless of which provider (Clerk today) sits behind the port. It's
 * also the request's authenticated principal on the tRPC context.
 */
export interface AuthIdentity {
  userId: string;
  orgId: string | null;
  orgRole: string | null;
  orgSlug: string | null;
}

/**
 * A third-party app (an AI assistant) acting for a user after an OAuth consent.
 * Unlike a session, the grant rarely names an organization: the user picked an
 * app to trust, not a business to act in.
 */
export interface OAuthGrant {
  userId: string;
  /** The OAuth app the user consented to. */
  clientId: string;
  scopes: string[];
  /** Who the token was minted for. Empty when the provider set no `aud`. */
  audiences: string[];
  /** An org the token itself names, if the provider put one there. */
  orgId: string | null;
}

/** One organization a user belongs to, as the provider reports it right now. */
export interface OrganizationMembershipSummary {
  orgId: string;
  orgName: string;
  orgSlug: string | null;
  orgRole: string;
}

/**
 * Port for the auth provider. Named by capability (what the app needs), not by
 * vendor — the Clerk-specific adapter implements it. Returns null for a
 * missing/invalid/expired token; callers decide whether that's allowed.
 */
export interface AuthClient {
  verifySessionToken(token: string): Promise<AuthIdentity | null>;
  verifyOAuthAccessToken(token: string): Promise<OAuthGrant | null>;
  fetchOrganizationMemberships(
    userId: string,
  ): Promise<OrganizationMembershipSummary[]>;
}
