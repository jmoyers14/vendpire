import { Schema, model } from "mongoose";

/**
 * One VERSION of a machine's slot layout: slot code → product, par, price.
 * Planograms are immutable — a layout change creates a new document with a
 * later effectiveFrom, so past visits keep the par/price they were filled
 * against. The current planogram is the one with the latest effectiveFrom.
 */
const slotSchema = new Schema(
  {
    slotCode: { type: String, required: true, trim: true },
    productId: { type: String, required: true },
    // How many units the slot holds when full — the refill target.
    par: { type: Number, required: true },
    priceCents: { type: Number, required: true },
  },
  { _id: false },
);

const planogramSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    machineId: { type: String, required: true, index: true },
    effectiveFrom: { type: Date, required: true },
    slots: { type: [slotSchema], required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The "current planogram for this machine" lookup.
planogramSchema.index({ orgId: 1, machineId: 1, effectiveFrom: -1 });
planogramSchema.index({ orgId: 1, updatedAt: -1 });

export const PlanogramModel = model("Planogram", planogramSchema);
