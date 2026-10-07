import type {
  PnlRows,
  PnlTotals,
  VisitAnomaly,
} from "@vendpire/domain";
import type {
  Visit,
  VisitInput,
  VisitLine,
  VisitListFilter,
  VisitRange,
} from "@vendpire/platform";

export type { Visit, VisitInput, VisitLine, VisitListFilter, VisitRange };

/**
 * What a client submits: the stored shape minus the one field the server owns.
 * Expressed as an Omit rather than restated, so a new Visit field cannot reach
 * the database without passing through here first.
 *
 * `recordedByUserId` is absent deliberately — it comes from the verified session
 * and is never accepted from a client.
 */
export type VisitDraft = Omit<VisitInput, "recordedByUserId">;

/**
 * A draft plus the field the server owns, as ONE payload. Kept together so
 * `create` doesn't take an orgId and a userId either side of the draft: both are
 * strings, so a transposition would typecheck and quietly stamp the wrong author
 * on a visit in the wrong tenant.
 */
export interface VisitSubmission {
  draft: VisitDraft;
  recordedByUserId: string;
}

/**
 * Facts about the WRITE that the engine's `VisitAnomaly` union deliberately
 * excludes — it covers arithmetic the read path derives, and where a machine
 * stood or which planogram it was filled against is about insertion, not
 * calculation.
 *
 * Neither is an error. A machine gets moved mid-route, and a fill against a
 * superseded planogram is a real event; rejecting either would throw away a
 * count that actually happened.
 */
export type VisitNotice =
  /** Counted somewhere other than where the machine is currently filed. */
  | {
      readonly kind: "machine-moved";
      readonly submittedLocationId: string;
      readonly machineLocationId: string;
    }
  /** Filled against a planogram that is no longer the machine's current one. */
  | {
      readonly kind: "stale-planogram";
      readonly submittedPlanogramId: string;
      readonly currentPlanogramId: string | null;
    };

/**
 * The outcome of a submit. More than the Visit, because the two things worth
 * logging and measuring — was this a retry, and did it arrive out of order —
 * are facts about the submission rather than fields on the entity. The procedure
 * still returns the plain Visit on the wire.
 */
export interface VisitCreation {
  visit: Visit;
  /**
   * This key had already been submitted, so no document was written and the
   * original is returned verbatim. Analytics and anomaly logging must skip a
   * replay, or one timed-out submit reports itself as several visits.
   */
  isReplay: boolean;
  /**
   * A visit with a LATER `countedAt` already existed. Accepted, never rejected:
   * you service at 9am with no signal, someone else services at 2pm and submits
   * first, and your draft syncs at 5pm. Both visits happened.
   */
  isOutOfOrder: boolean;
  /**
   * Engine anomalies this visit's own lines imply — over-par, over-removed,
   * unknown-removal-reason. The read path derives the same set; computing it
   * here is what gets it into the request log and the event at submit time.
   */
  anomalies: VisitAnomaly[];
  notices: VisitNotice[];
}

/** One machine's product-level profitability over a window. */
export interface VisitPnl {
  machineId: string;
  /** Echoed back so a caller can label the period it asked for. */
  from: string | null;
  to: string | null;
  rows: PnlRows;
  totals: PnlTotals;
  anomalies: VisitAnomaly[];
}

/**
 * Rows the org's visit list returns when the caller doesn't say. Not a "page
 * size": there is no cursor here, so this is a ceiling on one read rather than a
 * position in a sequence. Visits are bounded in practice by machines × route
 * frequency, which is why they don't need the purchases list's keyset paging.
 */
export const DEFAULT_VISIT_LIST_LIMIT = 100;

export interface VisitService {
  list(orgId: string, filter: VisitListFilter): Promise<Visit[]>;
  /** The newest visit of every machine — the mobile mirror's prior counts. */
  listLatestByOrg(orgId: string): Promise<Visit[]>;
  get(orgId: string, id: string): Promise<Visit | null>;
  /**
   * Idempotent on `draft.clientRequestId`: a second submit of the same key
   * returns the first visit rather than creating another, and never errors.
   */
  create(orgId: string, submission: VisitSubmission): Promise<VisitCreation>;
  /**
   * Soft-delete. There is deliberately no update — a visit's `remaining` is the
   * baseline the next visit is measured against, so editing one rewrites the
   * interval after it. A mistake is corrected by removing and re-counting.
   */
  remove(orgId: string, id: string): Promise<void>;
  pnl(orgId: string, machineId: string, range?: VisitRange): Promise<VisitPnl>;
}
