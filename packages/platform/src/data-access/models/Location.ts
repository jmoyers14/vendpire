import { Schema, model } from "mongoose";

/**
 * A business/site hosting one or more machines, with the commission terms owed
 * to it. Scoped to the Clerk organization (the vending business) via `orgId`.
 * Soft-deleted (deletedAt) so removals propagate to offline devices at sync.
 */
const commissionSchema = new Schema(
  {
    type: { type: String, enum: ["none", "percent", "flat"], required: true },
    // Basis points (1000 = 10%) — never a float percentage.
    percentBps: { type: Number, default: null },
    flatCents: { type: Number, default: null },
    // What the percentage applies to: total sales, or sales net of card fees.
    basis: { type: String, enum: ["gross", "net", null], default: null },
  },
  { _id: false },
);

const locationSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: {
      line1: { type: String, default: null, trim: true },
      city: { type: String, default: null, trim: true },
      state: { type: String, default: null, trim: true },
      zip: { type: String, default: null, trim: true },
      // From the Places resolve — enables route planning later.
      geo: {
        type: new Schema(
          {
            lat: { type: Number, required: true },
            lng: { type: Number, required: true },
          },
          { _id: false },
        ),
        default: null,
      },
    },
    contact: {
      name: { type: String, default: null, trim: true },
      phone: { type: String, default: null, trim: true },
      email: { type: String, default: null, trim: true, lowercase: true },
    },
    commission: { type: commissionSchema, required: true },
    notes: { type: String, default: null, trim: true },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

locationSchema.index({ orgId: 1, createdAt: -1 });
// Sync pull: "everything in this org changed since my last sync".
locationSchema.index({ orgId: 1, updatedAt: -1 });

export const LocationModel = model("Location", locationSchema);
