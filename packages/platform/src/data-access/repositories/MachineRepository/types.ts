/**
 * Machine entity — plain data, free of Mongoose types.
 */
export interface Machine {
  id: string;
  /** Where the machine sits NOW. Visits record their own locationId, so moving
   * a machine doesn't rewrite history. */
  locationId: string;
  name: string;
  kind: "snack" | "drink" | "combo";
  make: string | null;
  model: string | null;
  serial: string | null;
  /** What the QR/NFC sticker encodes — unique per org when set. */
  tagCode: string | null;
  /**
   * Layout lineage: the template this machine's face came from, or the one
   * saved off it. Provenance only — `slots` below is the machine's own
   * snapshot and is never resolved through the template.
   */
  templateId: string | null;
  /** The machine face: one array per shelf, slot codes in walking order. */
  slots: string[][];
  cardReader: { provider: "nayax" | "cantaloupe"; deviceId: string } | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MachineInput = Omit<Machine, "id" | "createdAt" | "updatedAt">;
