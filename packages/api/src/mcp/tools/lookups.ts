import type { Machine } from "../../services/MachineService/MachineService.ts";
import type { Product } from "../../services/ProductService/ProductService.ts";
import { type AgentScope, AgentToolError } from "./AgentTool.ts";

/**
 * Name to id, inside the tool. A model that had to call `find_machine` before
 * every read would spend half its turns on plumbing, and the id it carried
 * across would be the thing it got wrong.
 *
 * Exact id, tag code, or full name wins outright; a substring match only counts
 * when it is the only one. Anything ambiguous comes back as a question with the
 * candidates attached, never as a guess.
 */
export const resolveMachine = async (
  scope: AgentScope,
  machine: string,
): Promise<Machine> => {
  const machines = await scope.services.machineService.list(scope.orgId);
  const wanted = machine.trim().toLowerCase();

  const exact = machines.filter(
    (candidate) =>
      candidate.id.toLowerCase() === wanted ||
      candidate.name.toLowerCase() === wanted ||
      candidate.tagCode?.toLowerCase() === wanted,
  );
  const onlyExact = exact[0];
  if (onlyExact !== undefined && exact.length === 1) {
    return onlyExact;
  }

  const partial =
    exact.length > 1
      ? exact
      : machines.filter((candidate) =>
          candidate.name.toLowerCase().includes(wanted),
        );
  const onlyPartial = partial[0];
  if (onlyPartial !== undefined && partial.length === 1) {
    return onlyPartial;
  }

  if (partial.length === 0) {
    throw new AgentToolError(
      `No machine in ${scope.orgName} matches "${machine}".`,
      { machines: machines.map(summarizeForChoice) },
    );
  }
  throw new AgentToolError(
    `"${machine}" matches ${partial.length} machines. Name one exactly.`,
    { machines: partial.map(summarizeForChoice) },
  );
};

const summarizeForChoice = (
  machine: Machine,
): { id: string; name: string; tagCode: string | null } => ({
  id: machine.id,
  name: machine.name,
  tagCode: machine.tagCode,
});

/** Product id to name, for the many reads that store ids and report names. */
export const buildProductNames = async (
  scope: AgentScope,
): Promise<Map<string, string>> => {
  const products = await scope.services.productService.list(scope.orgId);
  return new Map(products.map((product) => [product.id, product.name]));
};

export const buildLocationNames = async (
  scope: AgentScope,
): Promise<Map<string, string>> => {
  const locations = await scope.services.locationService.list(scope.orgId);
  return new Map(locations.map((location) => [location.id, location.name]));
};

/**
 * A missing name is reported as missing. Falling back to the raw id would read
 * as a product called "68f3a1b2c4d5e6f708192a3b".
 */
export const nameOr = (
  names: Map<string, string>,
  id: string,
  fallback = "unknown product",
): string => names.get(id) ?? fallback;

export const productOr = (
  products: Map<string, Product>,
  id: string,
): Product | null => products.get(id) ?? null;
