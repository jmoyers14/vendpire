import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "@zenvend/platform";
import type { McpConfig } from "../config/mcpConfig.ts";
import type { AuthService } from "../services/AuthService/AuthService.ts";
import { buildMcpServer } from "./buildMcpServer.ts";
import type { AgentServices } from "./tools/index.ts";

const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
const AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";

/** Clerk's built-in OAuth scopes. Zenvend-specific ones come with the read tools. */
const SCOPES_SUPPORTED = ["profile", "email"];

export interface McpHttpHandler {
  handles(url: string): boolean;
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

/**
 * The MCP endpoint plus the OAuth discovery documents an assistant reads to find
 * out where to sign in (RFC 9728). Zenvend is only the resource server — Clerk
 * runs the authorization server, consent screen, and client registration.
 */
export const buildMcpHttpHandler = ({
  config,
  authService,
  services,
  log,
  version,
}: {
  config: McpConfig;
  authService: AuthService;
  /** Resolved once at boot: the services are singletons, like the router's. */
  services: AgentServices;
  log: Logger;
  version: string;
}): McpHttpHandler => {
  const resource = new URL(config.resourceUrl);
  const mcpPath = resource.pathname;
  // RFC 9728 §3.1: a resource with a path gets its metadata at the
  // well-known prefix plus that path.
  const metadataPath = `${PROTECTED_RESOURCE_METADATA_PATH}${mcpPath}`;
  const metadataUrl = `${resource.origin}${metadataPath}`;

  const protectedResourceMetadata = {
    resource: config.resourceUrl,
    authorization_servers: [config.authorizationServerUrl],
    scopes_supported: SCOPES_SUPPORTED,
    bearer_methods_supported: ["header"],
    resource_name: "Zenvend",
  };

  const routes = new Set([
    mcpPath,
    metadataPath,
    PROTECTED_RESOURCE_METADATA_PATH,
    AUTHORIZATION_SERVER_METADATA_PATH,
  ]);

  // Clients written before RFC 9728 discovery look for the authorization
  // server's metadata on the resource's own host.
  const proxyAuthorizationServerMetadata = async (
    res: ServerResponse,
  ): Promise<void> => {
    const upstream = await fetch(
      `${config.authorizationServerUrl}${AUTHORIZATION_SERVER_METADATA_PATH}`,
    );
    const metadata: unknown = await upstream.json();
    sendJson(res, upstream.status, metadata);
  };

  const serveMcp = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    // Stateless: no session to resume, so no server-initiated stream to open.
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("allow", "POST");
      res.end();
      return;
    }

    const identity = await authService.authenticateAgent(
      req.headers.authorization,
      { audience: config.resourceUrl },
    );
    if (identity === null) {
      res.setHeader(
        "www-authenticate",
        `Bearer resource_metadata="${metadataUrl}"`,
      );
      sendJson(res, 401, { error: "invalid_token" });
      return;
    }

    const server = buildMcpServer({
      identity,
      services,
      log: log.child({ userId: identity.userId, clientId: identity.clientId }),
      version,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  };

  return {
    handles: (url) => routes.has(new URL(url, resource.origin).pathname),

    handle: async (req, res) => {
      const { pathname } = new URL(req.url ?? "/", resource.origin);
      try {
        if (pathname === mcpPath) {
          await serveMcp(req, res);
          return;
        }
        if (pathname === AUTHORIZATION_SERVER_METADATA_PATH) {
          await proxyAuthorizationServerMetadata(res);
          return;
        }
        sendJson(res, 200, protectedResourceMetadata);
      } catch (error) {
        log.error({ err: error, pathname }, "mcp request failed");
        if (!res.headersSent) {
          sendJson(res, 500, { error: "internal_error" });
        }
      }
    },
  };
};
