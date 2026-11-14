import type {
  AuthIdentity,
  OAuthGrant,
  OrganizationMembershipSummary,
} from "@zenvend/platform";

/**
 * An AI assistant acting for a user. The OAuth grant names no organization, so
 * this carries every one the user belongs to and leaves the choice to the
 * caller.
 */
export interface AgentIdentity extends OAuthGrant {
  memberships: OrganizationMembershipSummary[];
}

/**
 * Authenticates an incoming request from its Authorization header. Provider-
 * agnostic: it handles the Bearer scheme and delegates token verification to
 * the AuthClient port, so this service never references Clerk.
 */
export interface AuthService {
  authenticate(authHeader: string | undefined): Promise<AuthIdentity | null>;
  /**
   * Accepts an OAuth access token rather than a session token. `audience` is
   * the resource the token must name, and it is required: an optional audience
   * is one a caller forgets to pass, and the check is what stops a token
   * minted for another resource server from working here.
   */
  authenticateAgent(
    authHeader: string | undefined,
    options: { audience: string },
  ): Promise<AgentIdentity | null>;
}
