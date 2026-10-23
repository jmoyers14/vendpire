import { verifyToken } from "@clerk/backend";
import { inject, injectable } from "tsyringe";
import { CLERK_CONFIG_TOKEN, type ClerkConfig } from "./clerkConfig.ts";
import { LOGGER_TOKEN, type Logger } from "../../logging/Logger.ts";
import type { AuthClient, AuthIdentity } from "./AuthClient.ts";

/**
 * Clerk adapter for the AuthClient port. This is the only file that imports the
 * Clerk SDK or knows Clerk's token shape — everything Clerk-specific (the secret
 * key, the `o`-claim quirk) is contained here so the rest of the app stays
 * provider-agnostic and Clerk could be swapped without touching a service.
 */
@injectable()
export class ClerkClient implements AuthClient {
  constructor(
    @inject(CLERK_CONFIG_TOKEN)
    private readonly config: ClerkConfig,
    @inject(LOGGER_TOKEN)
    private readonly logger: Logger,
  ) {}

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
      // Still returns null — an unverifiable token is an ordinary 401, not
      // something the caller should handle differently. But a bare `catch {
      // return null }` made a wrong secret key, an expired token, and a
      // malformed token indistinguishable from here, which is exactly what
      // made this port's one real bug take hours to find.
      this.logger.warn({ err: error }, "ClerkClient.verifySessionToken failed");
      return null;
    }
  }
}
