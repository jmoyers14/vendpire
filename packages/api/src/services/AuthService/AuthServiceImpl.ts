import { inject, injectable } from "tsyringe";
import { AUTH_CLIENT_TOKEN } from "@vendpire/platform";
import type { AuthClient, AuthIdentity } from "@vendpire/platform";
import type { AuthService } from "./AuthService.ts";

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
  ) {}

  async authenticate(
    authHeader: string | undefined,
  ): Promise<AuthIdentity | null> {
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }
    const token = authHeader.slice("Bearer ".length);
    return this.authClient.verifySessionToken(token);
  }
}
