/**
 * One-time (2026-09-28): Product.packagings (embedded case codes) become
 * first-class Pack documents — {name, barcodes (normalized GTIN-14),
 * contents:[{productId, units}]}. Packs with unknown unit counts get
 * units: 1 and are reported for fixing in the UI. Idempotent: skips
 * products whose packaging barcode already exists on a pack.
 *
 * Run: MONGODB_URI=... bun scripts/migratePackagingsToPacks.ts
 */
import mongoose from "mongoose";
import { container, PACK_SERVICE_TOKEN } from "../src/services/index.ts";
import { connectDatabase } from "@vendpire/platform/server";
import { normalizeGtin } from "@vendpire/domain";
import type { PackService } from "../src/services/PackService/PackService.ts";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}

await connectDatabase(uri);
const col = mongoose.connection.db!.collection("products");
const docs = await col
  .find({ "packagings.0": { $exists: true }, deletedAt: null })
  .toArray();
const orgId = docs[0]?.orgId as string | undefined;
if (!orgId) {
  console.log("nothing to migrate");
  process.exit(0);
}

const packService = container.resolve<PackService>(PACK_SERVICE_TOKEN);
const existing = await packService.list(orgId);
const knownBarcodes = new Set(existing.flatMap((pack) => pack.barcodes));

let created = 0;
const needsCount: string[] = [];
for (const doc of docs) {
  for (const packaging of doc.packagings as {
    barcode: string;
    unitsPerPack: number | null;
  }[]) {
    const gtin14 = normalizeGtin(packaging.barcode)?.gtin14;
    if (gtin14 && knownBarcodes.has(gtin14)) {
      continue;
    }
    const units = packaging.unitsPerPack ?? 1;
    const name = `${doc.name} — case${packaging.unitsPerPack ? ` (${units})` : " (count?)"}`;
    try {
      await packService.create(orgId, {
        name,
        barcodes: gtin14 ? [packaging.barcode] : [],
        contents: [{ productId: String(doc._id), units }],
        active: true,
      });
      created += 1;
      if (!packaging.unitsPerPack) {
        needsCount.push(name);
      }
    } catch (error) {
      console.log(`! ${doc.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
  await col.updateOne({ _id: doc._id }, { $unset: { packagings: "" } });
}
console.log(`created ${created} pack(s) from ${docs.length} product(s)`);
if (needsCount.length > 0) {
  console.log(`\nfix unit counts in the Packs UI for:\n- ${needsCount.join("\n- ")}`);
}
await mongoose.disconnect();
process.exit(0);
