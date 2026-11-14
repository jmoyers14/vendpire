import { z } from "zod";
import { parseConfig } from "@zenvend/platform/server";

/** Where AI assistants reach the MCP endpoint and where they sign in. */
export interface McpConfig {
  /** The public URL of `/mcp`. Tokens are minted for this resource. */
  resourceUrl: string;
  /** Clerk's Frontend API URL — the OAuth authorization server. */
  authorizationServerUrl: string;
}

export const MCP_CONFIG_TOKEN = "McpConfig";

const schema = z.object({
  resourceUrl: z.url(),
  authorizationServerUrl: z.url(),
});

/** Null when unconfigured, so an environment without it simply has no `/mcp`. */
export function loadMcpConfig(): McpConfig | null {
  const raw = {
    resourceUrl: process.env.MCP_RESOURCE_URL,
    authorizationServerUrl: process.env.CLERK_FRONTEND_API_URL,
  };
  if (raw.resourceUrl === undefined && raw.authorizationServerUrl === undefined) {
    return null;
  }
  return parseConfig("mcp", schema, raw);
}
