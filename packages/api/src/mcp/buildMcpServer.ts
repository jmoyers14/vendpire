import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "@vendpire/platform";
import type { AgentIdentity } from "../services/AuthService/AuthService.ts";
import {
  AGENT_READ_TOOLS,
  AgentToolError,
  type AgentServices,
  buildAgentScope,
} from "./tools/index.ts";

/**
 * What `whoami` reports. Also the escape hatch for the org question: when a
 * read tool refuses because the account has several businesses, this is where
 * the model learns their names.
 */
export interface AgentReport {
  userId: string;
  clientId: string;
  scopes: string[];
  audiences: string[];
  /** `org_id` from the token itself — the spike's open question. */
  tokenOrgId: string | null;
  memberships: AgentIdentity["memberships"];
  /** The org a tool would act in — only unambiguous with one membership. */
  activeOrgId: string | null;
}

export const buildAgentReport = (identity: AgentIdentity): AgentReport => ({
  userId: identity.userId,
  clientId: identity.clientId,
  scopes: identity.scopes,
  audiences: identity.audiences,
  tokenOrgId: identity.orgId,
  memberships: identity.memberships,
  activeOrgId:
    identity.memberships.length === 1
      ? (identity.memberships[0]?.orgId ?? null)
      : null,
});

/** One server per request: the transport is stateless, and so is identity. */
export const buildMcpServer = ({
  identity,
  services,
  log,
  version,
}: {
  identity: AgentIdentity;
  services: AgentServices;
  log: Logger;
  version: string;
}): McpServer => {
  const server = new McpServer({ name: "vendpire", version });

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Shows which Vendpire user this assistant is signed in as and which businesses they belong to.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => {
      const report = buildAgentReport(identity);
      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        structuredContent: { ...report },
      };
    },
  );

  for (const tool of AGENT_READ_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: true,
          openWorldHint: tool.readsOutsideWorld,
        },
      },
      async (args: unknown) => {
        try {
          const scope = buildAgentScope(identity, services, args);
          const output = await tool.execute(args, scope);
          return {
            content: [{ type: "text" as const, text: output.text }],
            structuredContent: output.data,
          };
        } catch (error) {
          return toolFailure(error, tool.name, log);
        }
      },
    );
  }

  return server;
};

/**
 * An AgentToolError is a question for the model — an ambiguous machine name, a
 * business it has to name — so its text is handed over verbatim. Anything else
 * is our bug, and the model gets a sentence it can repeat to the user while the
 * stack goes to the log rather than to the assistant.
 */
const toolFailure = (
  error: unknown,
  toolName: string,
  log: Logger,
): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
  structuredContent?: Record<string, unknown>;
} => {
  if (error instanceof AgentToolError) {
    log.info({ tool: toolName, reason: error.message }, "agent tool needs more");
    return {
      content: [{ type: "text", text: error.message }],
      isError: true,
      structuredContent: error.data,
    };
  }
  log.error({ tool: toolName, err: error }, "agent tool failed");
  return {
    content: [
      {
        type: "text",
        text: `The ${toolName} tool failed inside Vendpire. Nothing was changed. Try again, and report it if it keeps happening.`,
      },
    ],
    isError: true,
  };
};
