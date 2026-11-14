import { describe, expect, it } from "bun:test";
import type {
  AuthClient,
  Logger,
  OAuthGrant,
  OrganizationMembershipSummary,
} from "@vendpire/platform";
import { AuthServiceImpl } from "./AuthServiceImpl.ts";

const RESOURCE_URL = "https://api.vendpire.test/mcp";

const GRANT: OAuthGrant = {
  userId: "user_1",
  clientId: "client_1",
  scopes: ["profile"],
  audiences: [RESOURCE_URL],
  orgId: null,
};

const MEMBERSHIP: OrganizationMembershipSummary = {
  orgId: "org_1",
  orgName: "Moyers Vending",
  orgSlug: null,
  orgRole: "org:admin",
};

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as unknown as Logger;

/** Records which verifier saw the token, so a test can tell the two apart. */
const recordingAuthClient = (
  grant: OAuthGrant = GRANT,
): { client: AuthClient; calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    client: {
      verifySessionToken: async (token) => {
        calls.push(`session:${token}`);
        return null;
      },
      verifyOAuthAccessToken: async (token) => {
        calls.push(`oauth:${token}`);
        return token === "good" ? grant : null;
      },
      fetchOrganizationMemberships: async (userId) => {
        calls.push(`memberships:${userId}`);
        return [MEMBERSHIP];
      },
    },
  };
};

const authServiceWith = (grant?: OAuthGrant) => {
  const { client, calls } = recordingAuthClient(grant);
  return { service: new AuthServiceImpl(client, noopLogger), calls };
};

describe("AuthServiceImpl.authenticateAgent", () => {
  it("verifies the token as an OAuth grant and attaches live memberships", async () => {
    const { service, calls } = authServiceWith();

    const identity = await service.authenticateAgent("Bearer good", {
      audience: RESOURCE_URL,
    });

    expect(identity).toEqual({ ...GRANT, memberships: [MEMBERSHIP] });
    expect(calls).toEqual(["oauth:good", "memberships:user_1"]);
  });

  // A session token must never pass as an agent's: it carries an org the user
  // picked in the web app, which an assistant never consented to.
  it("never falls back to session verification", async () => {
    const { service, calls } = authServiceWith();

    const identity = await service.authenticateAgent("Bearer bad", {
      audience: RESOURCE_URL,
    });

    expect(identity).toBeNull();
    expect(calls).toEqual(["oauth:bad"]);
  });

  it("returns null without a Bearer header", async () => {
    const { service, calls } = authServiceWith();

    const identity = await service.authenticateAgent(undefined, {
      audience: RESOURCE_URL,
    });

    expect(identity).toBeNull();
    expect(calls).toEqual([]);
  });

  // The whole point of the audience claim: one Clerk instance can vouch for
  // several resource servers, and a token for one is not a token for another.
  it("rejects a valid token minted for another resource", async () => {
    const { service, calls } = authServiceWith({
      ...GRANT,
      audiences: ["https://someone-elses-app.test/mcp"],
    });

    const identity = await service.authenticateAgent("Bearer good", {
      audience: RESOURCE_URL,
    });

    expect(identity).toBeNull();
    // Rejected before the membership lookup, so a foreign token costs no
    // Backend API call.
    expect(calls).toEqual(["oauth:good"]);
  });

  // Clerk only sets `aud` once the MCP server is registered in the dashboard.
  // Failing closed turns that misconfiguration into a 401 rather than a token
  // that any Clerk app could mint.
  it("rejects a token carrying no audience at all", async () => {
    const { service } = authServiceWith({ ...GRANT, audiences: [] });

    const identity = await service.authenticateAgent("Bearer good", {
      audience: RESOURCE_URL,
    });

    expect(identity).toBeNull();
  });

  it("accepts a token whose audiences include the resource among others", async () => {
    const { service } = authServiceWith({
      ...GRANT,
      audiences: ["https://other.test/mcp", RESOURCE_URL],
    });

    const identity = await service.authenticateAgent("Bearer good", {
      audience: RESOURCE_URL,
    });

    expect(identity?.userId).toBe("user_1");
  });
});
