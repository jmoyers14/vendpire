import { z } from "zod";
import type { ExpiringSlot } from "../../services/VisitService/VisitService.ts";
import { DEFAULT_EXPIRY_WINDOW_DAYS } from "../../services/VisitService/VisitService.ts";
import { BUSINESS_PARAM, defineTool } from "./AgentTool.ts";
import { pluralize } from "./format.ts";

const describeSlot = (slot: ExpiringSlot): string =>
  `- ${slot.productName} in ${slot.machineName} (${slot.locationName}, slot ${slot.slotCode}) — ${pluralize(slot.units, "unit")}${slot.bestBy === null ? "" : `, best by ${slot.bestBy}`}`;

const toRow = (slot: ExpiringSlot): Record<string, unknown> => ({
  machineId: slot.machineId,
  machineName: slot.machineName,
  locationName: slot.locationName,
  slotCode: slot.slotCode,
  productId: slot.productId,
  productName: slot.productName,
  units: slot.units,
  bestBy: slot.bestBy,
  daysUntil: slot.daysUntil,
});

/**
 * What to pull and what to load before the next trip. Reads only each machine's
 * LATEST visit, because a best-by is a standing fact about what is in the slot
 * now, not an event.
 */
export const expiringStock = defineTool({
  name: "expiring_stock",
  title: "Expiring stock",
  description:
    "Stock that has expired or is about to, across every machine, based on each machine's most recent visit. Also reports slots whose product tracks expiration but has no date recorded — an empty expired list means nothing until you check that bucket.",
  inputSchema: {
    ...BUSINESS_PARAM,
    withinDays: z
      .number()
      .int()
      .positive()
      .max(365)
      .optional()
      .describe(
        `How many days ahead to warn about. Defaults to ${DEFAULT_EXPIRY_WINDOW_DAYS}.`,
      ),
  },
  execute: async (input, scope) => {
    const report = await scope.services.visitService.expiringSoon(scope.orgId, {
      withinDays: input.withinDays ?? DEFAULT_EXPIRY_WINDOW_DAYS,
    });

    const data = {
      business: scope.orgName,
      asOf: report.asOf,
      withinDays: report.withinDays,
      expired: report.expired.map(toRow),
      expiringSoon: report.expiringSoon.map(toRow),
      missingDates: report.missingDates.map(toRow),
    };

    const sections: string[] = [];

    if (report.expired.length > 0) {
      sections.push(
        `Already expired — pull these:\n${report.expired.map(describeSlot).join("\n")}`,
      );
    }
    if (report.expiringSoon.length > 0) {
      sections.push(
        `Expiring within ${pluralize(report.withinDays, "day")}:\n${report.expiringSoon.map(describeSlot).join("\n")}`,
      );
    }
    // Reported even when the other two buckets are empty: without it, "nothing
    // is expiring" and "nobody has recorded a date" look identical.
    if (report.missingDates.length > 0) {
      sections.push(
        `No best-by recorded, though these products track expiration:\n${report.missingDates.map(describeSlot).join("\n")}`,
      );
    }

    if (sections.length === 0) {
      return {
        text: `As of ${report.asOf}, nothing in ${scope.orgName} is expired or expiring within ${pluralize(report.withinDays, "day")}, and every expiration-tracked slot has a date on file.`,
        data,
      };
    }

    return {
      text: `${scope.orgName}, as of ${report.asOf}:\n\n${sections.join("\n\n")}`,
      data,
    };
  },
});
