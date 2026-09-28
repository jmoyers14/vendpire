/**
 * One-time (2026-09-28): the CSV import parked Costco CASE barcodes in
 * Product.upc, which semantically holds the UNIT barcode. Move each case code
 * into packagings[{barcode, unitsPerPack}] (count parsed from the CSV
 * description) and null the upc. Only touches upcs that appear in the CSV,
 * so hand-entered unit barcodes are never disturbed.
 *
 * Run: MONGODB_URI=... CSV=/path.csv bun scripts/migrateCaseUpcsToPackagings.ts
 */
import { readFileSync } from "node:fs";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
const csvPath = process.env.CSV;
if (!uri || !csvPath) {
  console.error("Set MONGODB_URI and CSV");
  process.exit(1);
}

const COUNT_IN_DESC = /\((\d+)[\s-]*(?:ct|pk|pack|bags|cans|bars)\b/i;

const caseCounts = new Map<string, number | null>();
for (const line of readFileSync(csvPath, "utf8").trim().split("\n").slice(1)) {
  const cols = line.split(",");
  const barcode = cols[3]?.trim();
  if (!barcode || barcode === "barcode") {
    continue;
  }
  const count = line.match(COUNT_IN_DESC)?.[1];
  caseCounts.set(barcode, count ? Number(count) : null);
}

await mongoose.connect(uri);
const col = mongoose.connection.db!.collection("products");
let moved = 0;
for (const [barcode, unitsPerPack] of caseCounts) {
  const result = await col.updateOne(
    { upc: barcode },
    { $set: { upc: null, packagings: [{ barcode, unitsPerPack }] } },
  );
  if (result.modifiedCount > 0) {
    moved += 1;
  }
}
console.log(`moved ${moved} case code(s) from upc to packagings`);
await mongoose.disconnect();
process.exit(0);
