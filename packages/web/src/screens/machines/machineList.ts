import type { ApiMachine } from "../../apiTypes.ts";
import { plural } from "../../utils/text.ts";
import { MACHINE_KIND_LABELS } from "./machineKind.ts";

/** "Snack · 48 slots" for a list row; the location is the group heading above it. */
export const machineSummaryFor = (machine: Pick<ApiMachine, "kind" | "slots">): string => {
  const slotCount = machine.slots.flat().length;
  return `${MACHINE_KIND_LABELS[machine.kind]} · ${plural(slotCount, { one: "slot", many: "slots" })}`;
};

export interface LocationGroup<Machine> {
  locationId: string;
  locationName: string | null;
  machines: Machine[];
}

/**
 * Machines bucketed by location, A–Z by location name. Names still loading
 * sort last; machines keep their incoming order within a location.
 */
export const buildLocationGroups = <Machine extends Pick<ApiMachine, "locationId">>(
  machines: Machine[],
  locationNameById: ReadonlyMap<string, string>,
): LocationGroup<Machine>[] => {
  const groupsById = new Map<string, LocationGroup<Machine>>();
  for (const machine of machines) {
    let group = groupsById.get(machine.locationId);
    if (!group) {
      group = {
        locationId: machine.locationId,
        locationName: locationNameById.get(machine.locationId) ?? null,
        machines: [],
      };
      groupsById.set(machine.locationId, group);
    }
    group.machines.push(machine);
  }
  return [...groupsById.values()].sort((a, b) => {
    if (a.locationName === null || b.locationName === null) {
      return Number(a.locationName === null) - Number(b.locationName === null);
    }
    return a.locationName.localeCompare(b.locationName);
  });
};
