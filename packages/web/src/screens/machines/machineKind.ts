import type { ApiMachine } from "../../apiTypes.ts";

/** What a machine sells, shared by machines and the templates they start from. */
export type MachineKind = ApiMachine["kind"];

export const MACHINE_KIND_LABELS: Record<MachineKind, string> = {
  snack: "Snack",
  drink: "Drink",
  combo: "Combo",
};
