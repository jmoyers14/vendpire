import type { PnlTotals } from "@vendpire/domain";
import type { ApiPnlSheet } from "../../apiTypes.ts";

type SheetMachine = ApiPnlSheet["locations"][number]["machines"][number];

export type TotalScope = "machine" | "location" | "grand";

interface Labeled {
  key: string;
  label: string;
}

interface Figures {
  units: number;
  revenueCents: number;
  cogsCents: number | null;
  grossProfitCents: number | null;
}

export type SheetRow = Labeled &
  (
    | { kind: "location" }
    | { kind: "machine" }
    | ({ kind: "item" } & Figures)
    | { kind: "pulled"; units: number; costCents: number | null }
    | ({ kind: "total"; scope: TotalScope } & Figures)
    | { kind: "net"; scope: TotalScope; netProfitCents: number | null }
  );

const unitsIn = (machines: readonly SheetMachine[]): number =>
  machines
    .flatMap((machine) => machine.items)
    .reduce((sum, item) => sum + item.units, 0);

/** A null write-off cost still means something was pulled. */
const hasPulledItems = (totals: PnlTotals): boolean =>
  totals.writeOffUnits > 0 || totals.writeOffCents === null;

/** The total, then any pulled rows, then the figure after them. */
const totalRows = ({
  key,
  label,
  scope,
  units,
  totals,
  pulled = [],
}: {
  key: string;
  label: string;
  scope: TotalScope;
  units: number;
  totals: PnlTotals;
  pulled?: SheetRow[];
}): SheetRow[] => {
  const total: SheetRow = {
    kind: "total",
    key: `${key}:total`,
    label,
    scope,
    units,
    revenueCents: totals.revenueCents,
    cogsCents: totals.cogsCents,
    grossProfitCents: totals.grossProfitCents,
  };
  const net: SheetRow = {
    kind: "net",
    key: `${key}:net`,
    label: "After pulled items",
    scope,
    netProfitCents: totals.netProfitCents,
  };
  return [total, ...pulled, ...(hasPulledItems(totals) ? [net] : [])];
};

const machineRows = (machine: SheetMachine, key: string): SheetRow[] => [
  { kind: "machine", key, label: machine.machineName },
  ...machine.items.map(
    (item): SheetRow => ({
      kind: "item",
      key: `${key}:item:${item.productId}`,
      label: item.productName,
      units: item.units,
      revenueCents: item.revenueCents,
      cogsCents: item.cogsCents,
      grossProfitCents: item.grossProfitCents,
    }),
  ),
  ...totalRows({
    key,
    label: "Machine total",
    scope: "machine",
    units: unitsIn([machine]),
    totals: machine.totals,
    pulled: machine.pulled.map(
      (item): SheetRow => ({
        kind: "pulled",
        key: `${key}:pulled:${item.productId}`,
        label: item.productName,
        units: item.units,
        costCents: item.costCents,
      }),
    ),
  }),
];

/** The sheet as the flat run of rows the table renders, top to bottom. */
export const buildSheetRows = (sheet: ApiPnlSheet): SheetRow[] => {
  if (sheet.locations.length === 0) {
    return [];
  }
  const rows: SheetRow[] = [];
  for (const location of sheet.locations) {
    const key = location.locationId;
    rows.push({ kind: "location", key, label: location.locationName });
    for (const machine of location.machines) {
      rows.push(...machineRows(machine, `${key}:${machine.machineId}`));
    }
    rows.push(
      ...totalRows({
        key,
        label: `${location.locationName} total`,
        scope: "location",
        units: unitsIn(location.machines),
        totals: location.totals,
      }),
    );
  }
  rows.push(
    ...totalRows({
      key: "grand",
      label: "All machines",
      scope: "grand",
      units: unitsIn(sheet.locations.flatMap((location) => location.machines)),
      totals: sheet.totals,
    }),
  );
  return rows;
};
