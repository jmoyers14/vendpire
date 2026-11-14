import { z } from "zod";
import { BUSINESS_PARAM, defineTool } from "./AgentTool.ts";
import { formatDay, pluralize } from "./format.ts";
import { buildProductNames, nameOr, resolveMachine } from "./lookups.ts";

const DEFAULT_LIMIT = 20;

/**
 * The service log. Deliberately reports units added and pulled rather than
 * "sold": sold is an interval between two visits, not a field on one, and
 * naming it here would invite the model to add up the wrong column. Sales live
 * in `machine_pnl`.
 */
export const recentVisits = defineTool({
  name: "recent_visits",
  title: "Recent visits",
  description:
    "Lists recent machine visits, newest first — when each machine was serviced, how much was loaded in, and anything pulled out. Does NOT report sales: use machine_pnl for revenue and units sold.",
  inputSchema: {
    ...BUSINESS_PARAM,
    machine: z
      .string()
      .optional()
      .describe("Limit to one machine, by name, tag code, or id."),
    from: z
      .string()
      .optional()
      .describe("Earliest visit date to include, as YYYY-MM-DD."),
    to: z.string().optional().describe("Latest visit date to include, as YYYY-MM-DD."),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .optional()
      .describe(`How many visits to return. Defaults to ${DEFAULT_LIMIT}.`),
  },
  execute: async (input, scope) => {
    const machine =
      input.machine === undefined
        ? null
        : await resolveMachine(scope, input.machine);

    const [visits, productNames, machines] = await Promise.all([
      scope.services.visitService.list(scope.orgId, {
        machineId: machine?.id ?? null,
        from: input.from ?? null,
        to: input.to ?? null,
        limit: input.limit ?? DEFAULT_LIMIT,
      }),
      buildProductNames(scope),
      scope.services.machineService.list(scope.orgId),
    ]);

    const machineNames = new Map(machines.map((each) => [each.id, each.name]));

    const rows = visits.map((visit) => {
      const added = visit.lines.reduce((sum, line) => sum + line.added, 0);
      const removed = visit.lines.reduce((sum, line) => sum + line.removed, 0);
      const removals = visit.lines
        .filter((line) => line.removed > 0)
        .map((line) => ({
          slotCode: line.slotCode,
          productName: nameOr(productNames, line.productId),
          units: line.removed,
          reason: line.removedReason,
        }));
      return {
        id: visit.id,
        machineId: visit.machineId,
        machineName: machineNames.get(visit.machineId) ?? "unknown machine",
        countedAt: visit.countedAt,
        slotsCounted: visit.lines.length,
        unitsAdded: added,
        unitsRemoved: removed,
        removals,
        notes: visit.notes,
      };
    });

    if (rows.length === 0) {
      const scopeText =
        machine === null ? scope.orgName : `${machine.name} in ${scope.orgName}`;
      return {
        text: `No visits found for ${scopeText} in that window.`,
        data: { business: scope.orgName, visits: [] },
      };
    }

    const lines = rows.map((row) => {
      const parts = [
        `${formatDay(row.countedAt)} — ${row.machineName}`,
        `${pluralize(row.slotsCounted, "slot")} counted`,
        `${row.unitsAdded} added`,
      ];
      if (row.unitsRemoved > 0) {
        const reasons = row.removals
          .map(
            (removal) =>
              `${removal.units} ${removal.productName} (${removal.reason ?? "no reason recorded"})`,
          )
          .join(", ");
        parts.push(`${row.unitsRemoved} pulled: ${reasons}`);
      }
      const notes = row.notes === null ? "" : `\n  note: ${row.notes}`;
      return `- ${parts.join(", ")}${notes}`;
    });

    return {
      text: `${pluralize(rows.length, "visit")}, newest first:\n${lines.join("\n")}`,
      data: { business: scope.orgName, visits: rows },
    };
  },
});
