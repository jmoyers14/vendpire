/**
 * One-time migration (2026-10-06): stamp a clientRequestId on every purchase
 * written before the field became required.
 *
 * The field is the idempotency key a client repeats when it retries a submit
 * it never saw the response to, and {orgId, clientRequestId} is now a plain
 * unique index. Historical rows have no key, and a plain unique index treats
 * every missing value as the same one — so without this backfill the index
 * cannot be built on a collection holding more than one legacy purchase.
 *
 * The keys minted here are synthetic. No client is retrying these purchases,
 * so the values only have to exist and be distinct; the `backfill:` prefix
 * keeps them obviously distinguishable from a real client's uuid.
 *
 * Run: MONGODB_URI=... bun scripts/backfillPurchaseClientRequestIds.ts
 * Idempotent: only touches documents that still lack a key.
 */
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}

await mongoose.connect(uri);
const purchases = mongoose.connection.db!.collection("purchases");

// Covers null, and absent-entirely on rows older than the field.
const keyless = await purchases
  .find({ clientRequestId: { $in: [null, undefined] } })
  .toArray();

for (const doc of keyless) {
  await purchases.updateOne(
    { _id: doc._id },
    { $set: { clientRequestId: `backfill:${crypto.randomUUID()}` } },
  );
  console.log(`${doc._id} (${doc.vendor ?? "?"}) → key stamped`);
}
console.log(`backfilled ${keyless.length} purchase(s)`);

// Build the unique index now rather than leaving it to autoIndex on next boot,
// so a duplicate surfaces here, against a known dataset, instead of at runtime.
await purchases.createIndex({ orgId: 1, clientRequestId: 1 }, { unique: true });
console.log("unique {orgId, clientRequestId} index in place");

await mongoose.disconnect();
