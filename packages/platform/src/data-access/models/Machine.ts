import { Schema, model } from "mongoose";

/**
 * A physical vending machine. `locationId` is where it sits NOW — each visit
 * records its own locationId, so moving a machine doesn't rewrite history.
 * `tagCode` is what the QR/NFC sticker encodes (unique per org when set).
 */
const machineSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    locationId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["snack", "drink", "combo"], required: true },
    make: { type: String, default: null, trim: true },
    model: { type: String, default: null, trim: true },
    serial: { type: String, default: null, trim: true },
    tagCode: { type: String, default: null, trim: true },
    // The machine face: one array per shelf, slot codes in walking order.
    // Stored structurally (not flat) so grids render exactly as authored —
    // no letter-prefix inference anywhere downstream.
    slots: { type: [[String]], default: [] },
    cardReader: {
      type: new Schema(
        {
          provider: { type: String, enum: ["nayax", "cantaloupe"], required: true },
          deviceId: { type: String, required: true, trim: true },
        },
        { _id: false },
      ),
      default: null,
    },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

machineSchema.index({ orgId: 1, createdAt: -1 });
machineSchema.index({ orgId: 1, updatedAt: -1 });
// Supports the tagCode-uniqueness check and the QR-scan lookup.
machineSchema.index({ orgId: 1, tagCode: 1 });

export const MachineModel = model("Machine", machineSchema);
