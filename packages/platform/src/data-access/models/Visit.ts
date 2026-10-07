import { Schema, model } from "mongoose";

/**
 * One servicing of one machine: what was in every slot when you walked up, and
 * what you did about it. Observations ONLY — no sold figure, revenue, COGS or
 * profit is ever stored. Every derived number is computed from the ordered
 * visit sequence at read time, so a backdated visit or a late Costco receipt
 * corrects history by itself (the same promise `Product.ts` keeps by refusing
 * to store a unit cost).
 *
 * Append-only by design: editing a visit silently rewrites the NEXT visit's
 * baseline, so there is no update path — only create and softDelete.
 */
const visitLineSchema = new Schema(
  {
    slotCode: { type: String, required: true, trim: true },
    productId: { type: String, required: true },
    /**
     * WHAT WAS PHYSICALLY IN THE SLOT WHEN YOU WALKED UP — before refilling
     * AND before pulling anything out. Expired units you are about to bin
     * still count here; `removed` is what takes them back out.
     *
     * NOTHING DOWNSTREAM CAN DETECT A POST-FILL COUNT. Store the count taken
     * after refilling and every sold figure, every revenue number and every
     * profit line is silently garbage, with no error raised anywhere, forever.
     * Capture surfaces must label this "Left in slot" and never "count".
     */
    remaining: { type: Number, required: true },
    /** Units loaded in during this servicing. */
    added: { type: Number, required: true },
    /**
     * Units pulled OUT during this servicing — expired, damaged, destocked.
     * Omit these and the arithmetic assumes a customer paid for them, which
     * invents revenue: the same family of bug as treating a missing line as 0.
     */
    removed: { type: Number, default: 0 },
    /**
     * Required whenever `removed > 0` — it decides write-off vs. transfer.
     * Stored as the raw reason; `@vendpire/domain` → `visits/removals.ts` owns
     * the one reason → disposition mapping, so the model never has a policy.
     */
    removedReason: {
      type: String,
      enum: ["expired", "damaged", "recalled", "destocked", "transferred"],
      default: null,
    },
    /** Snapshotted, so a later planogram edit cannot rewrite past revenue. */
    priceCents: { type: Number, required: true },
    /** Fill target in effect at this servicing. Never used in the P&L. */
    par: { type: Number, default: null },
  },
  { _id: false },
);

const visitSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    machineId: { type: String, required: true, index: true },
    /**
     * Where the machine stood when counted — a SNAPSHOT from the client, not
     * `machine.locationId`. The phone counts at 9am, someone moves the machine
     * at 2pm, the outbox submits at 5pm; resolving this server-side would
     * stamp the new location onto a visit that happened at the old one.
     */
    locationId: { type: String, required: true },
    /** Provenance only — the engine never reads a planogram. */
    planogramId: { type: String, default: null },
    /**
     * When you stood at the machine. Everything orders by THIS, never by
     * createdAt: an offline visit counted at 9am can reach the server after
     * one counted at 2pm, and sorting by arrival would make the later visit
     * the earlier one's baseline.
     */
    countedAt: { type: Date, required: true },
    /** Set server-side from the session, never accepted from a client. */
    recordedByUserId: { type: String, required: true },
    lines: { type: [visitLineSchema], required: true },
    notes: { type: String, default: null, trim: true },
    /**
     * Client-minted idempotency key, REQUIRED. A phone that times out mid
     * submit cannot tell "succeeded, response lost" from "failed", so it
     * retries; the unique index below is what makes that retry free.
     */
    clientRequestId: { type: String, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The engine workhorse, and per-machine history. Reads run ascending by
// countedAt but a compound index serves either direction.
visitSchema.index({ orgId: 1, machineId: 1, countedAt: -1 });
visitSchema.index({ orgId: 1, countedAt: -1 });
visitSchema.index({ orgId: 1, updatedAt: -1 });
// Plain unique is safe here only because clientRequestId is required. On a
// collection where it is nullable this needs a partialFilterExpression — a
// plain unique index rejects the SECOND null document. See Purchase.ts.
visitSchema.index({ orgId: 1, clientRequestId: 1 }, { unique: true });

export const VisitModel = model("Visit", visitSchema);
