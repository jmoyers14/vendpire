/**
 * Paced repair pass: for products missing an image, search the catalog by
 * cleaned name and take the top hit with an image. Spaced ~7s apart to
 * respect Open Food Facts' ~10 searches/min rate limit.
 *
 * Run: MONGODB_URI=... bun scripts/repairProductImages.ts
 */
import mongoose from "mongoose";
import { container } from "../src/services/index.ts";
import { PRODUCT_DATA_CLIENT_TOKEN } from "@vendpire/platform";
import type { ProductDataClient } from "@vendpire/platform";
import { connectDatabase } from "@vendpire/platform/server";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}

await connectDatabase(uri);
const catalog = container.resolve<ProductDataClient>(PRODUCT_DATA_CLIENT_TOKEN);
const col = mongoose.connection.db!.collection("products");
const missing = await col
  .find({ imageUrl: null, deletedAt: null })
  .toArray();
console.log(`${missing.length} product(s) missing images`);

let fixed = 0;
for (const doc of missing) {
  const searchName = String(doc.name)
    .replace(/\(.*?\)/g, "")
    .split("—")[0]!
    .trim();
  try {
    const hits = await catalog.searchByName(searchName);
    const imageUrl = hits.find((hit) => hit.imageUrl)?.imageUrl ?? null;
    if (imageUrl) {
      await col.updateOne({ _id: doc._id }, { $set: { imageUrl } });
      fixed += 1;
      console.log(`✓ ${doc.name}`);
    } else {
      console.log(`– ${doc.name}: no imaged hit for "${searchName}"`);
    }
  } catch (error) {
    console.log(`! ${doc.name}: ${error instanceof Error ? error.message : error}`);
  }
  await new Promise((r) => setTimeout(r, 7000));
}
console.log(`\nfixed ${fixed}/${missing.length}`);
await mongoose.disconnect();
process.exit(0);
