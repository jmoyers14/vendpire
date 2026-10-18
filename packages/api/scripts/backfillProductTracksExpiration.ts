/**
 * One-time migration (2026-10-17): set `tracksExpiration` on every product
 * written before the field became required.
 *
 * The field decides whether a stocked slot with no best-by date is reported as
 * a gap ("nobody recorded a date") or ignored ("this product has no useful
 * printed date"). It is required-with-default rather than nullable, because
 * "undecided" is not a meaningful third state — so historical rows need a
 * value rather than being left absent.
 *
 * True is the right default: most vending stock is dated, and a false positive
 * here costs one checkbox, while a false negative silently drops a product out
 * of the expiry report forever.
 *
 * Run: MONGODB_URI=... bun scripts/backfillProductTracksExpiration.ts
 * Idempotent: only touches documents that still lack the field.
 */
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}

await mongoose.connect(uri);
const products = mongoose.connection.db!.collection("products");

const result = await products.updateMany(
  { tracksExpiration: { $exists: false } },
  { $set: { tracksExpiration: true } },
);
console.log(`backfilled ${result.modifiedCount} product(s)`);

await mongoose.disconnect();
