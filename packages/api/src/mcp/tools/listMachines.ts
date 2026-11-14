import { z } from "zod";
import { BUSINESS_PARAM, defineTool } from "./AgentTool.ts";
import { formatDay, pluralize } from "./format.ts";
import { buildLocationNames } from "./lookups.ts";

/**
 * The route, with the one fact that makes it actionable: when each machine was
 * last serviced. Without that an operator still has to ask machine by machine.
 */
export const listMachines = defineTool({
  name: "list_machines",
  title: "List machines",
  description:
    "Lists every vending machine in the business with where it sits, what kind it is, and when it was last visited. Start here when the user asks what machines they have or which ones are overdue.",
  inputSchema: {
    ...BUSINESS_PARAM,
    includeInactive: z
      .boolean()
      .optional()
      .describe("Include retired machines. Defaults to false."),
  },
  execute: async (input, scope) => {
    const [machines, locationNames, latestVisits] = await Promise.all([
      scope.services.machineService.list(scope.orgId),
      buildLocationNames(scope),
      scope.services.visitService.listLatestByOrg(scope.orgId),
    ]);

    const lastVisitByMachine = new Map(
      latestVisits.map((visit) => [visit.machineId, visit.countedAt]),
    );
    const shown =
      input.includeInactive === true
        ? machines
        : machines.filter((machine) => machine.active);

    const rows = shown.map((machine) => {
      const lastVisitAt = lastVisitByMachine.get(machine.id) ?? null;
      return {
        id: machine.id,
        name: machine.name,
        kind: machine.kind,
        locationName: locationNames.get(machine.locationId) ?? "unknown location",
        locationId: machine.locationId,
        tagCode: machine.tagCode,
        active: machine.active,
        slotCount: machine.slots.flat().length,
        lastVisitAt,
      };
    });

    if (rows.length === 0) {
      return {
        text: `${scope.orgName} has no machines on file yet.`,
        data: { business: scope.orgName, machines: [] },
      };
    }

    const lines = rows.map((row) => {
      const visited =
        row.lastVisitAt === null
          ? "never visited"
          : `last visit ${formatDay(row.lastVisitAt)}`;
      const retired = row.active ? "" : ", RETIRED";
      return `- ${row.name} (${row.kind}) at ${row.locationName} — ${visited}, ${pluralize(row.slotCount, "slot")}${retired}`;
    });

    return {
      text: `${pluralize(rows.length, "machine")} in ${scope.orgName}:\n${lines.join("\n")}`,
      data: { business: scope.orgName, machines: rows },
    };
  },
});
