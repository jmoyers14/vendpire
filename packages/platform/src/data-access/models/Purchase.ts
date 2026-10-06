import { Schema, model } from "mongoose";

/**
 * A stock-buying run (e.g. Costco). Line items store the TOTAL cost, not a
 * unit cost — $14.99 / 30 doesn't divide evenly, and the total is what the
 * receipt actually says. Weighted-average unit cost is derived from these.
 */
const purchaseLineSchema = new Schema(
  {
    productId: { type: String, required: true },
    units: { type: Number, required: true },
    totalCostCents: { type: Number, required: true },
    // Set when the line came from expanding a pack — provenance only; the
    // stored units/cost are the facts the cost engine reads.
    packId: { type: String, default: null },
  },
  { _id: false },
);

const purchaseSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    purchasedAt: { type: Date, required: true },
    vendor: { type: String, required: true, trim: true },
    lines: { type: [purchaseLineSchema], required: true },
    // What the receipt says you paid, when recorded. Reconciliation anchor:
    // reports can flag purchases whose lines don't sum to this.
    receiptTotalCents: { type: Number, default: null },
    notes: { type: String, default: null, trim: true },
    /**
     * Client-minted idempotency key. NULLABLE here, unlike on Visit: the web
     * form predates it and submits none, and backfilling one onto historical
     * purchases would invent a guarantee those rows never had.
     */
    clientRequestId: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

purchaseSchema.index({ orgId: 1, purchasedAt: -1 });
// Keyset pagination reads in (purchasedAt desc, _id desc) order and compares on
// the pair, because purchasedAt is not unique — several supply runs share a
// date. _id has to be IN the index: Mongo orders equal-purchasedAt entries by
// RecordId, not by _id, so without this key it can serve the filter but not the
// sort and falls back to a blocking SORT over the whole org on every page.
purchaseSchema.index({ orgId: 1, purchasedAt: -1, _id: -1 });
purchaseSchema.index({ orgId: 1, updatedAt: -1 });
// partialFilterExpression is NOT optional here. clientRequestId is nullable, and
// a plain unique index treats every null as the same value — so it accepts the
// first purchase without a key and rejects the second with E11000. Restricting
// the index to documents where the field is a string leaves the nulls out of it
// entirely, so only real keys are ever compared.
purchaseSchema.index(
  { orgId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } },
);

export const PurchaseModel = model("Purchase", purchaseSchema);
