import { describe, expect, test } from "bun:test";
import { buildLocationGroups, machineSummaryFor } from "./machineList.ts";

test("machineSummaryFor reads type and slot count", () => {
  expect(machineSummaryFor({ kind: "combo", slots: [["A1", "A2"], ["B1"]] })).toBe("Combo · 3 slots");
  expect(machineSummaryFor({ kind: "snack", slots: [["A1"]] })).toBe("Snack · 1 slot");
});

describe("buildLocationGroups", () => {
  const locationNameById = new Map([
    ["office", "Office"],
    ["gym", "Gym"],
  ]);

  test("groups machines under their location, sorted by location name", () => {
    const machines = [
      { id: "m1", locationId: "office" },
      { id: "m2", locationId: "gym" },
      { id: "m3", locationId: "office" },
    ];

    const groups = buildLocationGroups(machines, locationNameById);

    expect(groups).toEqual([
      { locationId: "gym", locationName: "Gym", machines: [machines[1]] },
      { locationId: "office", locationName: "Office", machines: [machines[0], machines[2]] },
    ]);
  });

  test("puts a location whose name hasn't loaded last", () => {
    const machines = [
      { id: "m1", locationId: "unknown" },
      { id: "m2", locationId: "office" },
    ];

    const groups = buildLocationGroups(machines, locationNameById);

    expect(groups.map((group) => group.locationName)).toEqual(["Office", null]);
  });
});
