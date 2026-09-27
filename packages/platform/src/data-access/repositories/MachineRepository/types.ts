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
  /** The physical slots, in the order you walk them at the machine. */
  slotCodes: string[];
  cardReader: { provider: "nayax" | "cantaloupe"; deviceId: string } | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MachineInput = Omit<Machine, "id" | "createdAt" | "updatedAt">;
