import type { Cents } from "../types/index.ts";
import type { RemovalReason } from "./removals.ts";

/**
 * One slot's observation at one servicing. Observations only — no derived
 * figure is ever stored, so a backdated visit or a late receipt corrects
 * history by simply changing what the next read computes.
 *
 * Keyed downstream by (slotCode, productId) rather than slotCode alone, which
 * is what lets a mixed spiral record per-flavor counts, and what lets a slot
 * carry both its outgoing and incoming product on a re-planogram visit.
 */
export interface VisitLine {
  readonly slotCode: string;
  readonly productId: string;
  /**
   * What was physically in the slot when you walked up — BEFORE refilling and
   * BEFORE pulling anything out. Expired units you are about to bin still
   * count here; `removed` is what takes them back out.
   *
   * NOTHING DOWNSTREAM CAN DETECT A POST-FILL COUNT. Record the count after
   * refilling and every sold figure, every revenue number and every profit
   * line is silently garbage with no error raised anywhere. Capture surfaces
   * must label this "Left in slot" and never "count".
   */
  readonly remaining: number;
  /** Units loaded in during this servicing. */
  readonly added: number;
  /**
   * Units pulled OUT during this servicing — expired, damaged, or destocked.
   * Without this the arithmetic assumes a customer paid for them and invents
   * revenue, the same family of bug as treating a missing line as zero.
   */
  readonly removed: number;
  /** Required whenever `removed > 0`; it decides loss vs. transfer. */
  readonly removedReason: RemovalReason | null;
  /** Snapshotted, so a later planogram edit cannot rewrite past revenue. */
  readonly priceCents: Cents;
  /** Target fill level in effect at this servicing. Never used in the P&L. */
  readonly par: number | null;
}

/**
 * A whole servicing of one machine, as the engine consumes it. A DTO, not a
 * Mongoose document — this package stays runnable in the browser.
 */
export interface VisitObservation {
  readonly id: string;
  readonly machineId: string;
  /**
   * When you stood at the machine. The engine orders by THIS, never by
   * createdAt: an offline visit counted at 9am can reach the server after one
   * counted at 2pm, and sorting by arrival would make the later visit the
   * earlier one's baseline.
   */
  readonly countedAt: string;
  /** When the document reached the server. A sort tie-breaker only. */
  readonly createdAt: string;
  readonly lines: readonly VisitLine[];
}

/** Why an interval has no sold figure. Never coerce any of these to zero. */
export type UnknownSoldReason =
  | "first-visit"
  | "product-changed"
  | "slot-not-counted";
