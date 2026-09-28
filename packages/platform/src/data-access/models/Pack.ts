import { Schema, model } from "mongoose";

/**
 * A way of BUYING products, never of selling them: "Kirkland Coke 35pk",
 * "Frito-Lay 30ct variety". Contents map the pack to sellable units, so a
 * purchase line of a pack can expand into per-product units with the cost
 * split by unit count. Barcodes are case-level GTIN-14s (normalized).
 */
const packContentSchema = new Schema(
  {
    productId: { type: String, required: true },
    units: { type: Number, required: true },
  },
  { _id: false },
);

const packSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Case barcodes, normalized to GTIN-14. One pack can carry several
    // (packaging refreshes); a barcode belongs to at most one pack per org.
    barcodes: { type: [String], default: [] },
    contents: { type: [packContentSchema], required: true },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

packSchema.index({ orgId: 1, createdAt: -1 });
packSchema.index({ orgId: 1, updatedAt: -1 });
// Barcode resolution at scan/entry time.
packSchema.index({ orgId: 1, barcodes: 1 });

export const PackModel = model("Pack", packSchema);
