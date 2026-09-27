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
 * Port for the auth provider. Named by capability (what the app needs), not by
 * vendor — the Clerk-specific adapter implements it. Returns null for a
 * missing/invalid/expired token; callers decide whether that's allowed.
 */
export interface AuthClient {
  verifySessionToken(token: string): Promise<AuthIdentity | null>;
}
