import type { RemovalReason, VisitObservation } from "@vendpire/domain";

/**
 * Visit entity — one servicing of one machine, as plain data. Observations
 * only: no sold figure, revenue, COGS or profit is ever stored, so a backdated
 * visit or a late receipt corrects history by changing what the next read
 * computes.
 */
export interface VisitLine {
  slotCode: string;
  productId: string;
  /**
   * What was physically in the slot on arrival — BEFORE refilling and BEFORE
   * pulling anything out. See the emphatic note in `models/Visit.ts`: nothing
   * downstream can detect a post-fill count, and every derived number is
   * silently wrong if this is one.
   */
  remaining: number;
  /** Units loaded in during this servicing. */
  added: number;
  /** Units pulled out during this servicing — not sold, so not revenue. */
  removedUnits: number;
  /** Always set when `removedUnits > 0`; decides write-off vs. transfer. */
  removedReason: RemovalReason | null;
  /** Snapshotted, so a later planogram edit cannot rewrite past revenue. */
  priceCents: number;
  /** Fill target in effect at this servicing. Never used in the P&L. */
  par: number | null;
}

export interface Visit {
  id: string;
  machineId: string;
  /** Snapshot from the client — where the machine stood when counted. */
  locationId: string;
  /** Provenance only; the engine never reads a planogram. */
  planogramId: string | null;
  /** When you stood at the machine. The ordering key for everything. */
  countedAt: string;
  recordedByUserId: string;
  lines: VisitLine[];
  notes: string | null;
  /** The client-minted idempotency key this visit was created under. */
  clientRequestId: string;
  /** When the document reached the server. A sort tie-breaker only. */
  createdAt: string;
  updatedAt: string;
}

/**
 * Fails to compile unless `T` is exactly `true`. The false branch below must be
 * `false` and not `never`: `never` satisfies every constraint, so an assertion
 * written against `never` passes no matter what and proves nothing.
 */
type Assert<T extends true> = T;

/**
 * A compile-time proof that a stored Visit is directly consumable by the
 * calculation engine, so the two definitions cannot drift. If this line errors,
 * the engine's input contract moved and the repository needs a real mapper
 * instead of handing documents straight through.
 */
export type VisitFeedsEngine = Assert<
  Visit extends VisitObservation ? true : false
>;

/**
 * What gets stored. `recordedByUserId` is in here because the SERVICE sets it
 * from the session — it is never accepted from a client.
 */
export type VisitInput = Omit<Visit, "id" | "createdAt" | "updatedAt">;

/** Narrowing for the org-wide visit list. */
export interface VisitListFilter {
  machineId?: string | null;
  /** Inclusive lower bound on countedAt, as an ISO instant. */
  from?: string | null;
  /** Inclusive upper bound on countedAt, as an ISO instant. */
  to?: string | null;
  /** Rows to return, newest first. */
  limit?: number | null;
}

/** The window a P&L read asks for. */
export interface VisitRange {
  from?: string | null;
  to?: string | null;
}
