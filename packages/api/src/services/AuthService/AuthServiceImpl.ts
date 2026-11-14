import { inject, injectable } from "tsyringe";
import { AUTH_CLIENT_TOKEN, LOGGER_TOKEN } from "@vendpire/platform";
import type { AuthClient, AuthIdentity, Logger } from "@vendpire/platform";
import type { AgentIdentity, AuthService } from "./AuthService.ts";

const BEARER_PREFIX = "Bearer ";

const bearerTokenFrom = (authHeader: string | undefined): string | null =>
  authHeader?.startsWith(BEARER_PREFIX) === true
    ? authHeader.slice(BEARER_PREFIX.length)
    : null;

/**
 * Pulls the Bearer token off the Authorization header and asks the auth
 * provider to verify it. The Bearer scheme is the only transport detail it
 * owns; everything provider-specific lives behind AuthClient.
 */
@injectable()
export class AuthServiceImpl implements AuthService {
  constructor(
    @inject(AUTH_CLIENT_TOKEN)
    private readonly authClient: AuthClient,
    @inject(LOGGER_TOKEN)
    private readonly logger: Logger,
  ) {}

  async authenticate(
    authHeader: string | undefined,
  ): Promise<AuthIdentity | null> {
    const token = bearerTokenFrom(authHeader);
    if (token === null) {
      return null;
    }
    return this.authClient.verifySessionToken(token);
  }

  async authenticateAgent(
    authHeader: string | undefined,
    options: { audience: string },
  ): Promise<AgentIdentity | null> {
    const token = bearerTokenFrom(authHeader);
    if (token === null) {
      return null;
    }
    const grant = await this.authClient.verifyOAuthAccessToken(token);
    if (grant === null) {
      return null;
    }
    // Introspection says the token is valid, not that it was minted for us.
    // Without this, an access token for any other resource on the same Clerk
    // instance would be accepted here. A token carrying no `aud` fails too —
    // Clerk only sets the claim once the MCP server is registered, and a
    // missing audience is indistinguishable from the wrong one.
    if (!grant.audiences.includes(options.audience)) {
      this.logger.warn(
        {
          clientId: grant.clientId,
          audiences: grant.audiences,
          expected: options.audience,
        },
        "rejected an agent token minted for another resource",
      );
      return null;
    }
    // Read live from the provider, never from the Mongo mirror: membership
    // decides what an agent may read, and ADR 0001 rules the mirror out as an
    // authorization source.
    const memberships = await this.authClient.fetchOrganizationMemberships(
      grant.userId,
    );
    return { ...grant, memberships };
  }
}
