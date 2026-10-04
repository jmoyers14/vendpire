import { Schema, model } from "mongoose";

/**
 * A saved machine face you can reuse. Geometry only — what's in each slot is a
 * planogram concern. Machines SNAPSHOT a template's slots at create time and
 * then own them, so editing a template never retro-changes deployed machines.
 */
const machineTemplateSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["snack", "drink", "combo"], required: true },
    make: { type: String, default: null, trim: true },
    model: { type: String, default: null, trim: true },
    // Same shape as Machine.slots: one array per shelf, codes in walking order.
    slots: { type: [[String]], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Name uniqueness is service-enforced (case-insensitively), as it is for
// Machine.tagCode and Product.upc — a unique index plus soft deletes would
// burn a template name permanently after deletion.
machineTemplateSchema.index({ orgId: 1, name: 1 });
machineTemplateSchema.index({ orgId: 1, updatedAt: -1 });

export const MachineTemplateModel = model(
  "MachineTemplate",
  machineTemplateSchema,
);
