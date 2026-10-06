import type { UnknownSoldReason } from "./types.ts";

/**
 * Things worth telling the operator about, surfaced rather than thrown. The
 * engine never rejects or clamps — a visit records what happened in the field,
 * and discarding a count because it looks odd destroys real data.
 *
 * `out-of-order` is deliberately absent: a backdated visit is about insertion,
 * not arithmetic, so it belongs to the service layer rather than here.
 */
export type VisitAnomaly =
  /**
   * Sold came out below zero — stock added outside a visit, or a miscount.
   * Reported as-is and NEVER clamped: a −2 followed by a +14 still sums to the
   * true 12, where clamping would permanently overstate.
   */
  | {
      readonly kind: "negative-sold";
      readonly slotCode: string;
      readonly productId: string;
      readonly units: number;
    }
  /** No predecessor to diff against, so no sold figure exists. */
  | {
      readonly kind: "no-baseline";
      readonly slotCode: string;
      readonly productId: string;
      readonly reason: UnknownSoldReason;
    }
  /**
   * The slot changed product without the outgoing product being counted out,
   * so its final interval is unrecoverable: some of `unaccountedUnits` sold
   * and the rest went to the van, and nothing recorded says which.
   *
   * Avoidable — record a line for the outgoing product with
   * `removedUnits = remaining` and the interval computes normally.
   */
  | {
      readonly kind: "product-changed";
      readonly slotCode: string;
      readonly productId: string;
      readonly unaccountedUnits: number;
    }
  /**
   * The slot was absent from the later visit. A missing line is NOT
   * `remaining = 0` — treating it as zero books the whole leftover as sold and
   * invents revenue, the most dangerous bug available here.
   */
  | {
      readonly kind: "slot-not-counted";
      readonly slotCode: string;
      readonly productId: string;
    }
  /** Filled past par. Warn only — you really can cram an extra bag in. */
  | {
      readonly kind: "over-par";
      readonly slotCode: string;
      readonly productId: string;
      readonly level: number;
      readonly par: number;
    }
  /** Removed more than was found. A data-entry error; computed anyway. */
  | {
      readonly kind: "over-removed";
      readonly slotCode: string;
      readonly productId: string;
      readonly remaining: number;
      readonly removedUnits: number;
    }
  /**
   * Units were removed with no reason recorded, so loss-vs-transfer is
   * unknowable. Excluded from the write-off figure rather than guessed —
   * guessing either overstates loss or hides it.
   */
  | {
      readonly kind: "unknown-removal-reason";
      readonly slotCode: string;
      readonly productId: string;
      readonly units: number;
    }
  /** No purchase history for the product, so its COGS is unknown, not zero. */
  | {
      readonly kind: "unknown-cost";
      readonly productId: string;
    };
