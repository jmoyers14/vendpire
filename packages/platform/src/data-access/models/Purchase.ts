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
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

purchaseSchema.index({ orgId: 1, purchasedAt: -1 });
purchaseSchema.index({ orgId: 1, updatedAt: -1 });

export const PurchaseModel = model("Purchase", purchaseSchema);
