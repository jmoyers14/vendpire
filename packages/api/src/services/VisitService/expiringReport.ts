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

/** Walking order. Also the tiebreaker for equal dates: `findLatestByOrg`
 *  groups, and `$group` guarantees no document order, so without this two
 *  reads of unchanged data can come back in different orders. */
const byRoute = (a: ExpiringSlot, b: ExpiringSlot): number =>
  a.locationName.localeCompare(b.locationName) ||
  a.machineName.localeCompare(b.machineName) ||
  a.slotCode.localeCompare(b.slotCode);

const bySoonest = (a: ExpiringSlot, b: ExpiringSlot): number =>
  (a.bestBy ?? "").localeCompare(b.bestBy ?? "") || byRoute(a, b);

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
      const row: ExpiringSlot = {
        machineId: machine.id,
        machineName: machine.name,
        locationId: visit.locationId,
        locationName: location?.name ?? "Unknown location",
        slotCode: slot.slotCode,
        productId: slot.productId,
        productName: product?.name ?? "Unknown product",
        units: slot.units,
        bestBy: slot.bestBy,
        daysUntil:
          slot.bestBy === null ? null : calendarDaysUntil(slot.bestBy, asOf),
      };

      if (slot.bestBy === null) {
        // Unknown products keep asking: a slot that silently stops wanting a
        // date is the failure this report exists to prevent.
        if (product?.tracksExpiration ?? true) {
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
  report.missingDates.sort(byRoute);
  return report;
};
