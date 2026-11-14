import type { AgentIdentity } from "../../services/AuthService/AuthService.ts";
import type { AgentScope, AgentServices, AgentTool } from "./AgentTool.ts";
import { expiringStock } from "./expiringStock.ts";
import { findProduct } from "./findProduct.ts";
import { listMachines } from "./listMachines.ts";
import { lookupBarcode } from "./lookupBarcode.ts";
import { machineDetail } from "./machineDetail.ts";
import { machinePnl } from "./machinePnl.ts";
import { recentPurchases } from "./recentPurchases.ts";
import { recentVisits } from "./recentVisits.ts";
import { resolveBusiness } from "./resolveBusiness.ts";

export type {
  AgentScope,
  AgentServices,
  AgentTool,
  AgentToolOutput,
} from "./AgentTool.ts";
export { AgentToolError } from "./AgentTool.ts";

/**
 * Every read an assistant can do, in the order a new user meets them. Nothing
 * here writes, so the whole set is safe to expose before write tools have a
 * confirmation story.
 */
export const AGENT_READ_TOOLS: AgentTool[] = [
  listMachines,
  machineDetail,
  recentVisits,
  machinePnl,
  recentPurchases,
  findProduct,
  lookupBarcode,
  expiringStock,
];

/**
 * Picks the business this call reads before the tool runs, so no tool body has
 * to think about it. `business` is read off the raw input because resolution
 * has to happen before the tool's own schema is applied.
 */
export const buildAgentScope = (
  identity: AgentIdentity,
  services: AgentServices,
  rawInput: unknown,
): AgentScope => {
  const asked = (rawInput as { business?: unknown } | null | undefined)?.business;
  const business = typeof asked === "string" ? asked : undefined;
  const { orgId, orgName } = resolveBusiness(identity, business);
  return { orgId, orgName, services };
};
