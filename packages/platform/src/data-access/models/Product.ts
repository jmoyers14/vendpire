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
    // The UNIT barcode (on the can/bag itself) — null until verified.
    upc: { type: String, default: null, trim: true },
    // Purchasable package configurations: the case/box barcode and how many
    // sellable units it contains. Scanning a case at purchase time resolves
    // through these.
    packagings: {
      type: [
        new Schema(
          {
            barcode: { type: String, required: true, trim: true },
            unitsPerPack: { type: Number, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    category: { type: String, required: true, trim: true },
    taxClass: { type: String, default: null, trim: true },
    // From the catalog lookup (or hand-set). Hotlinked for now.
    imageUrl: { type: String, default: null, trim: true },
    defaultPriceCents: { type: Number, required: true },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

productSchema.index({ orgId: 1, createdAt: -1 });
productSchema.index({ orgId: 1, updatedAt: -1 });

export const ProductModel = model("Product", productSchema);
