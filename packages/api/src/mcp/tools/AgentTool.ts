import { z } from "zod";
import type { MachineService } from "../../services/MachineService/MachineService.ts";
import type { LocationService } from "../../services/LocationService/LocationService.ts";
import type { ProductService } from "../../services/ProductService/ProductService.ts";
import type { PurchaseService } from "../../services/PurchaseService/PurchaseService.ts";
import type { VisitService } from "../../services/VisitService/VisitService.ts";
import type { BarcodeResolverService } from "../../services/BarcodeResolverService/BarcodeResolverService.ts";

/**
 * Only the services a read tool actually needs. Narrower than the tRPC
 * Context's bundle on purpose: a test builds one of these with four stubs
 * instead of thirteen.
 */
export interface AgentServices {
  machineService: MachineService;
  locationService: LocationService;
  productService: ProductService;
  purchaseService: PurchaseService;
  visitService: VisitService;
  barcodeResolverService: BarcodeResolverService;
}

/** What a tool runs against: one business, already resolved. */
export interface AgentScope {
  orgId: string;
  orgName: string;
  services: AgentServices;
}

/**
 * Both renderings of one answer. `text` is what the model reads, so it carries
 * the narration an unknown must never lose; `data` is the same facts as values
 * for a caller that renders its own UI.
 */
export interface AgentToolOutput {
  text: string;
  data: Record<string, unknown>;
}

/**
 * A tool shaped so nothing about it knows MCP exists. The in-app assistant and
 * a future ChatGPT app register the same array against their own transports.
 */
export interface AgentTool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** True when the tool can reach something outside Vendpire's own data. */
  readsOutsideWorld: boolean;
  execute(rawInput: unknown, scope: AgentScope): Promise<AgentToolOutput>;
}

/**
 * A failure the MODEL is meant to read and act on — an ambiguous machine name,
 * a business it has to name. Carries `data` so the caller gets the candidates
 * as values, not just prose to re-parse.
 */
export class AgentToolError extends Error {
  readonly data: Record<string, unknown>;

  constructor(message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.name = "AgentToolError";
    this.data = data;
  }
}

/**
 * Captures each tool's own input type while keeping the exported array
 * homogeneous. The parse here is not redundant with the MCP SDK's: a non-MCP
 * caller hands `execute` whatever it has, and this is the only gate.
 */
export const defineTool = <Shape extends z.ZodRawShape>(spec: {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  readsOutsideWorld?: boolean;
  execute(
    input: z.infer<z.ZodObject<Shape>>,
    scope: AgentScope,
  ): Promise<AgentToolOutput>;
}): AgentTool => ({
  name: spec.name,
  title: spec.title,
  description: spec.description,
  inputSchema: spec.inputSchema,
  readsOutsideWorld: spec.readsOutsideWorld ?? false,
  execute: async (rawInput, scope) => {
    const parsed = z.object(spec.inputSchema).parse(rawInput ?? {});
    return spec.execute(parsed as z.infer<z.ZodObject<Shape>>, scope);
  },
});

/** Every tool accepts it, so the one-business case never has to say which. */
export const BUSINESS_PARAM = {
  business: z
    .string()
    .optional()
    .describe(
      "Which business to read, by name or id. Omit when the user belongs to only one.",
    ),
};
