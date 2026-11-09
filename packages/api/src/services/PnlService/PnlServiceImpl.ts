import { inject, injectable } from "tsyringe";
import { buildCostBasis, buildPnlTotals, type UnitCost } from "@vendpire/domain";
import {
  LOCATION_REPOSITORY_TOKEN,
  MACHINE_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
  PURCHASE_REPOSITORY_TOKEN,
  VISIT_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  LocationRepository,
  MachineRepository,
  ProductRepository,
  PurchaseRepository,
  VisitRange,
  VisitRepository,
} from "@vendpire/platform";
import { buildPeriodPnl } from "./periodPnl.ts";
import { buildPnlSheet, type MachinePeriod } from "./pnlSheet.ts";
import type { MachinePnl, PnlService, PnlSheet } from "./PnlService.ts";

const namesById = (
  records: readonly ({ id: string; name: string } | null)[],
): Map<string, string> =>
  new Map(
    records.flatMap((record) => (record ? [[record.id, record.name]] : [])),
  );

@injectable()
export class PnlServiceImpl implements PnlService {
  constructor(
    @inject(VISIT_REPOSITORY_TOKEN)
    private readonly visits: VisitRepository,
    @inject(MACHINE_REPOSITORY_TOKEN)
    private readonly machines: MachineRepository,
    @inject(LOCATION_REPOSITORY_TOKEN)
    private readonly locations: LocationRepository,
    @inject(PRODUCT_REPOSITORY_TOKEN)
    private readonly products: ProductRepository,
    @inject(PURCHASE_REPOSITORY_TOKEN)
    private readonly purchases: PurchaseRepository,
  ) {}

  async byMachine(
    orgId: string,
    machineId: string,
    range: VisitRange = {},
  ): Promise<MachinePnl> {
    const [visits, costBasis] = await Promise.all([
      this.visits.findByMachineAscending(orgId, machineId, range),
      this.loadCostBasis(orgId),
    ]);
    const { rows, anomalies } = buildPeriodPnl({ visits, range, costBasis });

    return {
      machineId,
      from: range.from ?? null,
      to: range.to ?? null,
      rows,
      totals: buildPnlTotals(rows),
      anomalies,
    };
  }

  async sheet(
    orgId: string,
    range: { from: string; to: string },
  ): Promise<PnlSheet> {
    const [inWindow, costBasis] = await Promise.all([
      this.visits.findByOrg(orgId, range),
      this.loadCostBasis(orgId),
    ]);

    // Newest first, so the first visit seen per machine is its last in the window.
    const locationIdByMachine = new Map<string, string>();
    for (const visit of inWindow) {
      if (!locationIdByMachine.has(visit.machineId)) {
        locationIdByMachine.set(visit.machineId, visit.locationId);
      }
    }

    const [periodRows, machineNames, locationNames] = await Promise.all([
      Promise.all(
        [...locationIdByMachine].map(async ([machineId, locationId]) => {
          const visits = await this.visits.findByMachineAscending(
            orgId,
            machineId,
            range,
          );
          const { rows } = buildPeriodPnl({ visits, range, costBasis });
          return { machineId, locationId, rows };
        }),
      ),
      this.loadMachineNames(orgId, [...locationIdByMachine.keys()]),
      this.loadLocationNames(orgId, [...new Set(locationIdByMachine.values())]),
    ]);

    const periods: MachinePeriod[] = periodRows.map((period) => ({
      ...period,
      machineName: machineNames.get(period.machineId) ?? null,
      locationName: locationNames.get(period.locationId) ?? null,
    }));
    const productNames = await this.loadProductNames(orgId, periods);

    return { ...range, ...buildPnlSheet(periods, productNames) };
  }

  /** All-time and org-wide: the weighted average IS all-time, so a receipt
   *  entered three weeks late still corrects a visit that predates it. */
  private async loadCostBasis(
    orgId: string,
  ): Promise<ReadonlyMap<string, UnitCost>> {
    const costLines = await this.purchases.findCostBasisLines(orgId);
    return buildCostBasis(costLines);
  }

  /** Deleted-tolerant: a machine retired since still earned that month's sales. */
  private async loadMachineNames(
    orgId: string,
    machineIds: readonly string[],
  ): Promise<Map<string, string>> {
    const machines = await Promise.all(
      machineIds.map((id) => this.machines.findByIdIncludingDeleted(orgId, id)),
    );
    return namesById(machines);
  }

  private async loadLocationNames(
    orgId: string,
    locationIds: readonly string[],
  ): Promise<Map<string, string>> {
    const locations = await Promise.all(
      locationIds.map((id) => this.locations.findByIdIncludingDeleted(orgId, id)),
    );
    return namesById(locations);
  }

  private async loadProductNames(
    orgId: string,
    periods: readonly MachinePeriod[],
  ): Promise<Map<string, string>> {
    const productIds = new Set<string>();
    for (const { rows } of periods) {
      for (const row of rows.intervals) {
        productIds.add(row.interval.productId);
      }
      for (const row of rows.removals) {
        productIds.add(row.removal.productId);
      }
    }
    const products = await this.products.findByIdsIncludingDeleted(orgId, [
      ...productIds,
    ]);
    return new Map(products.map((product) => [product.id, product.name]));
  }
}
