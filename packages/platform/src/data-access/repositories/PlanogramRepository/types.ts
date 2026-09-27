/**
 * Planogram entity — one immutable VERSION of a machine's slot layout. A
 * layout change creates a new document with a later effectiveFrom; the current
 * planogram is the latest one. Past visits keep the version they filled against.
 */
export interface PlanogramSlot {
  slotCode: string;
  productId: string;
  /** How many units the slot holds when full — the refill target. */
  par: number;
  priceCents: number;
}

export interface Planogram {
  id: string;
  machineId: string;
  effectiveFrom: string;
  slots: PlanogramSlot[];
  createdAt: string;
  updatedAt: string;
}

export type PlanogramInput = Omit<Planogram, "id" | "createdAt" | "updatedAt">;
