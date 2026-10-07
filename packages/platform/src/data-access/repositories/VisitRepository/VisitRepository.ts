import type { Visit, VisitInput, VisitListFilter, VisitRange } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for visits. Org-scoped; deletes are soft and reads
 * exclude soft-deleted documents.
 *
 * There is deliberately NO update. A visit's `remaining` is the baseline the
 * next visit's sold figure is measured against, so editing one silently
 * rewrites the interval after it. Visits are append-only; a mistake is
 * corrected by soft-deleting and re-counting.
 */
export interface VisitRepository {
  /** The org's visits, newest first. Bounded by `filter.limit`. */
  findByOrg(orgId: string, filter?: VisitListFilter): Promise<Visit[]>;
  /**
   * One machine's visits in ASCENDING (countedAt, createdAt, _id) order — the
   * total order the calculation engine requires.
   *
   * When `from` is given the result INCLUDES the last visit strictly before it.
   * Slicing a window naively leaves the first visit inside it without a
   * predecessor, so every key reports `first-visit` and the first interval's
   * revenue silently becomes zero.
   */
  findByMachineAscending(
    orgId: string,
    machineId: string,
    range?: VisitRange,
  ): Promise<Visit[]>;
  /** The newest visit of EVERY machine in the org, in one pass. */
  findLatestByOrg(orgId: string): Promise<Visit[]>;
  findLatestByMachine(orgId: string, machineId: string): Promise<Visit | null>;
  findById(orgId: string, id: string): Promise<Visit | null>;
  /**
   * The idempotency read. A client that retries a submit it never saw the
   * response to must get its original visit back, not a second one.
   */
  findByClientRequestId(
    orgId: string,
    clientRequestId: string,
  ): Promise<Visit | null>;
  create(orgId: string, data: VisitInput): Promise<Visit>;
  softDelete(orgId: string, id: string): Promise<void>;
}
