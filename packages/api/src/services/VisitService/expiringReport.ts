import {
  calendarDaysUntil,
  calendarDateAfter,
  expirationsForVisit,
  type CalendarDate,
} from "@vendpire/domain";
import type { Location, Machine, Product, Visit } from "@vendpire/platform";
import type { ExpiringReport, ExpiringSlot } from "./VisitService.ts";

/** `location` and `productById` entries are nullable: a visit snapshots both
 *  as references, and either can be deleted afterwards. */
export interface PopulatedVisit {
  visit: Visit;
  machine: Machine;
  location: Location | null;
  productById: Map<string, Product>;
}

const bySoonest = (a: ExpiringSlot, b: ExpiringSlot): number =>
  a.bestBy === b.bestBy ? 0 : (a.bestBy ?? "") < (b.bestBy ?? "") ? -1 : 1;

/** Takes every visit at once because the sort is cross-visit: soonest on the
 *  route first, not soonest per machine. */
export const buildExpiringReport = (
  visits: readonly PopulatedVisit[],
  { asOf, withinDays }: { asOf: CalendarDate; withinDays: number },
): ExpiringReport => {
  const report: ExpiringReport = {
    asOf,
    withinDays,
    expired: [],
    expiringSoon: [],
    missingDates: [],
  };
  const cutoff = calendarDateAfter(asOf, withinDays);

  for (const { visit, machine, location, productById } of visits) {
    for (const slot of expirationsForVisit(visit)) {
      const product = productById.get(slot.productId);
      if (!product) {
        continue;
      }

      const row: ExpiringSlot = {
        machineId: machine.id,
        machineName: machine.name,
        locationId: visit.locationId,
        locationName: location?.name ?? "Unknown location",
        slotCode: slot.slotCode,
        productId: slot.productId,
        productName: product.name,
        units: slot.units,
        bestBy: slot.bestBy,
        daysUntil:
          slot.bestBy === null ? null : calendarDaysUntil(slot.bestBy, asOf),
      };

      if (slot.bestBy === null) {
        if (product.tracksExpiration) {
          report.missingDates.push(row);
        }
        continue;
      }
      if (slot.bestBy < asOf) {
        report.expired.push(row);
        continue;
      }
      if (slot.bestBy <= cutoff) {
        report.expiringSoon.push(row);
      }
    }
  }

  report.expired.sort(bySoonest);
  report.expiringSoon.sort(bySoonest);
  return report;
};
