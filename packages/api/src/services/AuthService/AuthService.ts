import type { AuthIdentity } from "@vendpire/platform";

/**
 * Authenticates an incoming request from its Authorization header. Provider-
 * agnostic: it handles the Bearer scheme and delegates token verification to
 * the AuthClient port, so this service never references Clerk.
 */
export interface AuthService {
  authenticate(authHeader: string | undefined): Promise<AuthIdentity | null>;
}
