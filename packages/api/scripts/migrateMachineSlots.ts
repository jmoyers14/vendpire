/**
 * One-time migration (2026-09-27): Machine.slotCodes (flat string[]) →
 * Machine.slots (string[][], one array per shelf). Shelf structure is
 * recovered by grouping consecutive codes that share a leading-letter prefix
 * — the same heuristic the UI used before the layout became first-class.
 *
 * Run: MONGODB_URI=... bun scripts/migrateMachineSlots.ts
 * Idempotent: only touches docs that still have slotCodes.
 */
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}

const groupSlotCodes = (codes: string[]): string[][] => {
  const groups: string[][] = [];
  let prefix: string | null = null;
  for (const code of codes) {
    const match = code.match(/^[A-Za-z]+/);
    const codePrefix = match ? match[0].toUpperCase() : null;
    if (codePrefix !== null && codePrefix === prefix && groups.length > 0) {
      groups[groups.length - 1]!.push(code);
    } else {
      groups.push([code]);
      prefix = codePrefix;
    }
  }
  return groups;
};

await mongoose.connect(uri);
const machines = mongoose.connection.db!.collection("machines");
const docs = await machines
  .find({ slotCodes: { $exists: true } })
  .toArray();

for (const doc of docs) {
  const slotCodes = (doc.slotCodes ?? []) as string[];
  const slots = groupSlotCodes(slotCodes);
  await machines.updateOne(
    { _id: doc._id },
    { $set: { slots }, $unset: { slotCodes: "" } },
  );
  console.log(`${doc.name}: ${slotCodes.length} codes → ${slots.length} shelves`);
}
console.log(`migrated ${docs.length} machine(s)`);
await mongoose.disconnect();
