import { z } from "zod";
import { BUSINESS_PARAM, defineTool } from "./AgentTool.ts";
import { formatDay, formatMoney, pluralize } from "./format.ts";
import { buildProductNames, nameOr, resolveMachine } from "./lookups.ts";

/** What the commission line should say, given a union that has three shapes. */
const describeCommission = (
  commission:
    | { type: "none" }
    | { type: "percent"; percentBps: number; basis: "gross" | "net" }
    | { type: "flat"; flatCents: number },
): string => {
  if (commission.type === "none") {
    return "no commission";
  }
  if (commission.type === "flat") {
    return `${formatMoney(commission.flatCents)} flat commission`;
  }
  return `${commission.percentBps / 100}% of ${commission.basis} sales`;
};

/**
 * One machine in full, including what is currently in it. The slot levels come
 * from the last visit's `remaining` plus what was added then — the same
 * baseline the next visit will diff against.
 */
export const machineDetail = defineTool({
  name: "machine_detail",
  title: "Machine detail",
  description:
    "Everything about one machine: where it is, the location's commission terms, and what the last visit left in each slot. Accepts the machine's name, tag code, or id.",
  inputSchema: {
    ...BUSINESS_PARAM,
    machine: z
      .string()
      .describe("The machine's name, tag code, or id — a partial name is fine."),
  },
  execute: async (input, scope) => {
    const machine = await resolveMachine(scope, input.machine);
    const [location, productNames, visits] = await Promise.all([
      scope.services.locationService.get(scope.orgId, machine.locationId),
      buildProductNames(scope),
      scope.services.visitService.list(scope.orgId, {
        machineId: machine.id,
        limit: 1,
      }),
    ]);

    const lastVisit = visits[0] ?? null;
    const slots =
      lastVisit === null
        ? []
        : lastVisit.lines.map((line) => ({
            slotCode: line.slotCode,
            productId: line.productId,
            productName: nameOr(productNames, line.productId),
            // What the slot held when the operator walked away, which is what
            // the next visit's count gets compared against.
            unitsAfterVisit: line.remaining + line.added - line.removed,
            priceCents: line.priceCents,
            bestBy: line.bestBy,
          }));

    const data = {
      business: scope.orgName,
      machine: {
        id: machine.id,
        name: machine.name,
        kind: machine.kind,
        make: machine.make,
        model: machine.model,
        serial: machine.serial,
        tagCode: machine.tagCode,
        active: machine.active,
        shelves: machine.slots.length,
        slotCount: machine.slots.flat().length,
        cardReader: machine.cardReader,
      },
      location:
        location === null
          ? null
          : {
              id: location.id,
              name: location.name,
              address: location.address,
              contact: location.contact,
              commission: location.commission,
            },
      lastVisit:
        lastVisit === null
          ? null
          : { id: lastVisit.id, countedAt: lastVisit.countedAt, slots },
    };

    const header = [
      `${machine.name} (${machine.kind}${machine.active ? "" : ", RETIRED"})`,
      location === null
        ? "Location: unknown"
        : `Location: ${location.name} — ${describeCommission(location.commission)}`,
      `Face: ${machine.slots.length} ${machine.slots.length === 1 ? "shelf" : "shelves"}, ${pluralize(machine.slots.flat().length, "slot")}`,
      machine.tagCode === null ? null : `Tag code: ${machine.tagCode}`,
    ].filter((line): line is string => line !== null);

    if (lastVisit === null) {
      return {
        text: `${header.join("\n")}\n\nNo visits recorded yet, so nothing is known about what is in it.`,
        data,
      };
    }

    const slotLines = slots.map(
      (slot) =>
        `- ${slot.slotCode}: ${slot.productName} — ${slot.unitsAfterVisit} units at ${formatMoney(slot.priceCents)}${slot.bestBy === null ? "" : `, best by ${slot.bestBy}`}`,
    );

    return {
      text: `${header.join("\n")}\n\nAs of the last visit (${formatDay(lastVisit.countedAt)}):\n${slotLines.join("\n")}`,
      data,
    };
  },
});
