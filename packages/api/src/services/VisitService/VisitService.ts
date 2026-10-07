import type { PnlRows, PnlTotals, VisitAnomaly } from "@vendpire/domain";
import type {
  Visit,
  VisitInput,
  VisitLine,
  VisitListFilter,
  VisitRange,
} from "@vendpire/platform";

export type { Visit, VisitInput, VisitLine, VisitListFilter, VisitRange };

/** The stored shape minus `recordedByUserId`, which comes from the session. */
export type VisitDraft = Omit<VisitInput, "recordedByUserId">;

/** One payload, so `create` has no orgId and userId either side of the draft —
 *  both are strings, and a transposition would typecheck. */
export interface VisitSubmission {
  draft: VisitDraft;
  recordedByUserId: string;
}

/**
 * Write-path facts the engine's `VisitAnomaly` union excludes, since it covers
 * arithmetic the read path derives. Neither is an error: machines get moved, and
 * a fill against a superseded planogram is a real event.
 */
export type VisitNotice =
  | {
      readonly kind: "machine-moved";
      readonly submittedLocationId: string;
      readonly machineLocationId: string;
    }
  | {
      readonly kind: "stale-planogram";
      readonly submittedPlanogramId: string;
      readonly currentPlanogramId: string | null;
    };

/** The outcome of a submit. More than the Visit, because "was this a retry" and
 *  "did it arrive late" are facts about the submission, not fields on a visit. */
export interface VisitCreation {
  visit: Visit;
  /** Already-submitted key, original returned verbatim. Logging and analytics
   *  MUST skip a replay, or one timed-out submit reports itself as several. */
  isReplay: boolean;
  /** A later `countedAt` already existed. Accepted — offline backdating is
   *  normal, and both visits happened. */
  isOutOfOrder: boolean;
  /** What this visit's own lines imply: over-par, over-removed,
   *  unknown-removal-reason. The read path derives the same set. */
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

/** A ceiling on one read, not a page size — there is no cursor here. */
export const DEFAULT_VISIT_LIST_LIMIT = 100;

export interface VisitService {
  list(orgId: string, filter: VisitListFilter): Promise<Visit[]>;
  /** The newest visit of every machine — the mobile mirror's prior counts. */
  listLatestByOrg(orgId: string): Promise<Visit[]>;
  get(orgId: string, id: string): Promise<Visit | null>;
  /** Idempotent on `draft.clientRequestId`: a repeat submit returns the first
   *  visit rather than creating another, and never errors. */
  create(orgId: string, submission: VisitSubmission): Promise<VisitCreation>;
  /** Soft-delete. No update: a visit's `remaining` is the next visit's
   *  baseline, so editing one rewrites the interval after it. */
  remove(orgId: string, id: string): Promise<void>;
  pnl(orgId: string, machineId: string, range?: VisitRange): Promise<VisitPnl>;
}
