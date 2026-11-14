import {
  createClerkClient,
  verifyToken,
  type ClerkClient as ClerkBackendClient,
} from "@clerk/backend";
import { inject, injectable } from "tsyringe";
import { CLERK_CONFIG_TOKEN, type ClerkConfig } from "./clerkConfig.ts";
import { LOGGER_TOKEN, type Logger } from "../../logging/Logger.ts";
import type {
  AuthClient,
  AuthIdentity,
  OAuthGrant,
  OrganizationMembershipSummary,
} from "./AuthClient.ts";

/**
 * Reads `org_id` off a JWT access token the Backend API has already verified.
 * Opaque tokens have no claims to read.
 */
const orgIdClaimFrom = (token: string): string | null => {
  const [, payload] = token.split(".");
  if (payload === undefined) {
    return null;
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      org_id?: unknown;
    };
    return typeof claims.org_id === "string" ? claims.org_id : null;
  } catch {
    return null;
  }
};

/** Clerk caps a page at 500; nobody belongs to that many businesses. */
const MEMBERSHIP_PAGE_LIMIT = 100;

/**
 * Clerk adapter for the AuthClient port. This is the only file that imports the
 * Clerk SDK or knows Clerk's token shape — everything Clerk-specific (the secret
 * key, the `o`-claim quirk) is contained here so the rest of the app stays
 * provider-agnostic and Clerk could be swapped without touching a service.
 */
@injectable()
export class ClerkClient implements AuthClient {
  private readonly backend: ClerkBackendClient;

  constructor(
    @inject(CLERK_CONFIG_TOKEN)
    private readonly config: ClerkConfig,
    @inject(LOGGER_TOKEN)
    private readonly logger: Logger,
  ) {
    this.backend = createClerkClient({ secretKey: config.secretKey });
  }

  async verifySessionToken(token: string): Promise<AuthIdentity | null> {
    try {
      const claims = await verifyToken(token, {
        secretKey: this.config.secretKey,
      });
      // Clerk v2 session tokens nest org data under `o` (id/rol/slg); v1 used
      // top-level org_* claims. Read both so either token version works.
      const o = (claims as { o?: { id?: string; rol?: string; slg?: string } }).o;
      return {
        userId: claims.sub,
        orgId: claims.org_id ?? o?.id ?? null,
        orgRole: claims.org_role ?? (o?.rol ? `org:${o.rol}` : null),
        orgSlug: claims.org_slug ?? o?.slg ?? null,
      };
    } catch (error) {
      // Still returns null — an unverifiable token is an ordinary 401. But a
      // bare `catch { return null }` made a bad secret key indistinguishable
      // from an expired or malformed token, which once cost hours to debug.
      this.logger.warn({ err: error }, "ClerkClient.verifySessionToken failed");
      return null;
    }
  }

  async verifyOAuthAccessToken(token: string): Promise<OAuthGrant | null> {
    try {
      // A Backend API round trip, not a local JWT check: Clerk issues opaque
      // OAuth tokens by default, and only the API knows about a revocation.
      const grant = await this.backend.idPOAuthAccessToken.verify(token);
      if (grant.revoked || grant.expired) {
        return null;
      }
      return {
        userId: grant.subject,
        clientId: grant.clientId,
        scopes: grant.scopes,
        audiences: grant.aud ?? [],
        orgId: orgIdClaimFrom(token),
      };
    } catch (error) {
      this.logger.warn({ err: error }, "ClerkClient.verifyOAuthAccessToken failed");
      return null;
    }
  }

  async fetchOrganizationMemberships(
    userId: string,
  ): Promise<OrganizationMembershipSummary[]> {
    const { data } = await this.backend.users.getOrganizationMembershipList({
      userId,
      limit: MEMBERSHIP_PAGE_LIMIT,
    });
    return data.map((membership) => ({
      orgId: membership.organization.id,
      orgName: membership.organization.name,
      orgSlug: membership.organization.slug,
      orgRole: membership.role,
    }));
  }
}
