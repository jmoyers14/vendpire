import { afterEach, describe, expect, it } from "bun:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Logger } from "@vendpire/platform";
import type {
  AgentIdentity,
  AuthService,
} from "../services/AuthService/AuthService.ts";
import { buildMcpHttpHandler } from "./buildMcpHttpHandler.ts";
import { buildTestAgentServices, testMachine } from "./tools/testAgentServices.ts";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as unknown as Logger;

const RESOURCE_URL = "https://api.vendpire.test/mcp";
const AUTHORIZATION_SERVER_URL = "https://clerk.vendpire.test";

const agent = (over: Partial<AgentIdentity> = {}): AgentIdentity => ({
  userId: "user_1",
  clientId: "client_1",
  scopes: ["profile", "email"],
  audiences: [RESOURCE_URL],
  orgId: null,
  memberships: [
    { orgId: "org_1", orgName: "Moyers Vending", orgSlug: null, orgRole: "org:admin" },
  ],
  ...over,
});

/** Accepts exactly one token, so a test proves the header reached it. */
const authServiceAccepting = (
  token: string,
  identity: AgentIdentity,
): AuthService => ({
  authenticate: async () => null,
  authenticateAgent: async (header) =>
    header === `Bearer ${token}` ? identity : null,
});

let server: http.Server | null = null;

const startServer = async (authService: AuthService): Promise<string> => {
  const handler = buildMcpHttpHandler({
    config: {
      resourceUrl: RESOURCE_URL,
      authorizationServerUrl: AUTHORIZATION_SERVER_URL,
    },
    authService,
    services: buildTestAgentServices({ machines: [testMachine()] }),
    log: noopLogger,
    version: "0.0.0-test",
  });
  server = http.createServer((req, res) => void handler.handle(req, res));
  await new Promise<void>((resolve) => server?.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
};

afterEach(() => {
  server?.close();
  server = null;
});

const postMcp = (
  baseUrl: string,
  body: unknown,
  token?: string,
): Promise<Response> =>
  fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

interface WhoamiResponse {
  id: number;
  result: { structuredContent: Record<string, unknown> };
}

const whoamiCall = (id: number): unknown => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name: "whoami", arguments: {} },
});

describe("buildMcpHttpHandler", () => {
  it("claims only its own routes", async () => {
    const handler = buildMcpHttpHandler({
      config: {
        resourceUrl: RESOURCE_URL,
        authorizationServerUrl: AUTHORIZATION_SERVER_URL,
      },
      authService: authServiceAccepting("t", agent()),
      services: buildTestAgentServices(),
      log: noopLogger,
      version: "0.0.0-test",
    });

    expect(handler.handles("/mcp")).toBe(true);
    expect(handler.handles("/.well-known/oauth-protected-resource/mcp")).toBe(true);
    expect(handler.handles("/api/v1/visits/latest")).toBe(false);
    expect(handler.handles("/visits.list")).toBe(false);
  });

  // RFC 9728 §3.1: an assistant derives this path from the resource URL, so
  // serving metadata only at the bare well-known path breaks discovery.
  it("serves protected resource metadata at the path-inserted location", async () => {
    const baseUrl = await startServer(authServiceAccepting("t", agent()));

    const response = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`);
    const metadata = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(metadata.resource).toBe(RESOURCE_URL);
    expect(metadata.authorization_servers).toEqual([AUTHORIZATION_SERVER_URL]);
  });

  it("challenges a request without a token with the metadata URL", async () => {
    const baseUrl = await startServer(authServiceAccepting("t", agent()));

    const response = await postMcp(baseUrl, { jsonrpc: "2.0", id: 1, method: "tools/list" });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://api.vendpire.test/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("challenges a token the auth service rejects", async () => {
    const baseUrl = await startServer(authServiceAccepting("good", agent()));

    const response = await postMcp(
      baseUrl,
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      "bad",
    );

    expect(response.status).toBe(401);
  });

  it("refuses GET, since a stateless server has no stream to open", async () => {
    const baseUrl = await startServer(authServiceAccepting("t", agent()));

    const response = await fetch(`${baseUrl}/mcp`);

    expect(response.status).toBe(405);
  });

  it("answers whoami with the caller's identity and single org", async () => {
    const baseUrl = await startServer(authServiceAccepting("good", agent()));

    const response = await postMcp(
      baseUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "whoami", arguments: {} },
      },
      "good",
    );
    const body = (await response.json()) as {
      result: { structuredContent: Record<string, unknown> };
    };

    expect(response.status).toBe(200);
    expect(body.result.structuredContent.userId).toBe("user_1");
    expect(body.result.structuredContent.activeOrgId).toBe("org_1");
  });

  it("names no active org when the user belongs to several", async () => {
    const identity = agent({
      memberships: [
        { orgId: "org_1", orgName: "A", orgSlug: null, orgRole: "org:admin" },
        { orgId: "org_2", orgName: "B", orgSlug: null, orgRole: "org:member" },
      ],
    });
    const baseUrl = await startServer(authServiceAccepting("good", identity));

    const response = await postMcp(
      baseUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "whoami", arguments: {} },
      },
      "good",
    );
    const body = (await response.json()) as {
      result: { structuredContent: Record<string, unknown> };
    };

    expect(body.result.structuredContent.activeOrgId).toBeNull();
  });

  // The audience check is the gate, so this proves the handler hands the auth
  // service the resource it actually serves rather than something else.
  it("asks the auth service for the resource it serves as the audience", async () => {
    const seen: Array<{ audience: string }> = [];
    const baseUrl = await startServer({
      authenticate: async () => null,
      authenticateAgent: async (header, options) => {
        seen.push(options);
        return header === "Bearer good" ? agent() : null;
      },
    });

    await postMcp(baseUrl, { jsonrpc: "2.0", id: 1, method: "tools/list" }, "good");

    expect(seen).toEqual([{ audience: RESOURCE_URL }]);
  });

  // Stateless means a fresh server and transport per request. A leaked session
  // would show up as the second call failing with "server already initialized".
  it("serves repeated calls on one handler", async () => {
    const baseUrl = await startServer(authServiceAccepting("good", agent()));

    for (const id of [1, 2, 3]) {
      const response = await postMcp(baseUrl, whoamiCall(id), "good");
      const body = (await response.json()) as WhoamiResponse;

      expect(response.status).toBe(200);
      expect(body.id).toBe(id);
      expect(body.result.structuredContent.userId).toBe("user_1");
    }
  });

  it("serves concurrent calls without crossing responses", async () => {
    const baseUrl = await startServer(authServiceAccepting("good", agent()));
    const ids = [1, 2, 3, 4, 5];

    const responses = await Promise.all(
      ids.map((id) => postMcp(baseUrl, whoamiCall(id), "good")),
    );
    const bodies = (await Promise.all(
      responses.map((response) => response.json()),
    )) as WhoamiResponse[];

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(bodies.map((body) => body.id)).toEqual(ids);
  });

  it("advertises the read tools alongside whoami", async () => {
    const baseUrl = await startServer(authServiceAccepting("good", agent()));

    const response = await postMcp(
      baseUrl,
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      "good",
    );
    const body = (await response.json()) as {
      result: { tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }> };
    };
    const names = body.result.tools.map((tool) => tool.name);

    expect(names).toContain("whoami");
    expect(names).toContain("list_machines");
    expect(names).toContain("machine_pnl");
    expect(names).toContain("expiring_stock");
    // Nothing in this set writes, and the annotation is how a client knows it
    // can run them without asking the user first.
    expect(
      body.result.tools.every((tool) => tool.annotations?.readOnlyHint === true),
    ).toBe(true);
  });

  it("runs a read tool end to end against the services it was given", async () => {
    const baseUrl = await startServer(authServiceAccepting("good", agent()));

    const response = await postMcp(
      baseUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_machines", arguments: {} },
      },
      "good",
    );
    const body = (await response.json()) as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };

    expect(response.status).toBe(200);
    expect(body.result.isError).toBeUndefined();
    expect(body.result.content[0]?.text).toContain("Lobby Snack");
  });

  // A model has to be able to read the refusal and fix its own call, so an
  // ambiguous-input failure is a tool result, not a JSON-RPC error.
  it("returns a tool error the model can act on, not a protocol error", async () => {
    const twoBusinesses = agent({
      memberships: [
        { orgId: "org_1", orgName: "A", orgSlug: null, orgRole: "org:admin" },
        { orgId: "org_2", orgName: "B", orgSlug: null, orgRole: "org:member" },
      ],
    });
    const baseUrl = await startServer(authServiceAccepting("good", twoBusinesses));

    const response = await postMcp(
      baseUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "list_machines", arguments: {} },
      },
      "good",
    );
    const body = (await response.json()) as {
      error?: unknown;
      result: { content: Array<{ text: string }>; isError?: boolean };
    };

    expect(response.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toContain("more than one business");
  });

  // Clients written before RFC 9728 discovery look for the authorization
  // server's metadata on the resource's own host.
  it("proxies the authorization server metadata from the provider", async () => {
    const baseUrl = await startServer(authServiceAccepting("t", agent()));
    const realFetch = globalThis.fetch;
    const upstreamUrl = `${AUTHORIZATION_SERVER_URL}/.well-known/oauth-authorization-server`;
    type FetchArgs = Parameters<typeof fetch>;
    globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
      if (String(input) === upstreamUrl) {
        return Response.json({ issuer: AUTHORIZATION_SERVER_URL });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    try {
      const response = await realFetch(
        `${baseUrl}/.well-known/oauth-authorization-server`,
      );
      const metadata = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(metadata.issuer).toBe(AUTHORIZATION_SERVER_URL);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
