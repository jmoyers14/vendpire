import { Schema, model } from "mongoose";

/**
 * A sellable item (one UPC). Unit cost is NOT stored here — it's derived from
 * purchases as a weighted average, so a late-synced receipt corrects history.
 * `taxClass` feeds California's vending tax rules (CDTFA pub. 118) in reports.
 */
const productSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    upc: { type: String, default: null, trim: true },
    category: { type: String, required: true, trim: true },
    taxClass: { type: String, default: null, trim: true },
    defaultPriceCents: { type: Number, required: true },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

productSchema.index({ orgId: 1, createdAt: -1 });
productSchema.index({ orgId: 1, updatedAt: -1 });

export const ProductModel = model("Product", productSchema);
