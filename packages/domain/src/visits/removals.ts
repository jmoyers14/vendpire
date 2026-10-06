/**
 * Why units left a slot without being sold, and what that means to the P&L.
 *
 * This is the one place the loss-vs-transfer policy lives. The engine never
 * branches on a reason directly — it asks for the reason's disposition — so
 * adding a reason later ("stolen", "sampled") is a one-line table change
 * rather than an arithmetic change.
 */

export type RemovalReason =
  /** Past date, binned. */
  | "expired"
  /** Crushed, leaking, binned. */
  | "damaged"
  /** Manufacturer recall, binned. */
  | "recalled"
  /** Slow mover pulled back to the van to sell elsewhere. */
  | "destocked"
  /** Moved straight into another machine. */
  | "transferred";

export type RemovalDisposition =
  /** The units are gone. You paid for them and nobody ever will. */
  | "written-off"
  /**
   * Still your inventory. Deliberately NOT a cost: unit cost is an all-time,
   * org-wide weighted average per product, so when these sell at another
   * machine their COGS lands there. Booking them here would double-count.
   */
  | "returned-to-stock";

const DISPOSITIONS: Record<RemovalReason, RemovalDisposition> = {
  expired: "written-off",
  damaged: "written-off",
  recalled: "written-off",
  destocked: "returned-to-stock",
  transferred: "returned-to-stock",
};

export const dispositionFor = (reason: RemovalReason): RemovalDisposition =>
  DISPOSITIONS[reason];

export const isWrittenOff = (reason: RemovalReason): boolean =>
  DISPOSITIONS[reason] === "written-off";
