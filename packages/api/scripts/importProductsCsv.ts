/**
 * Import test products from a Costco inventory CSV (line, item, case price,
 * barcode, description, confidence). Barcoded rows become Products: name
 * cleaned of pack-count suffixes, case UPC stored, category inferred, image
 * looked up on Open Food Facts, and a PLACEHOLDER sell price of ~2x unit cost
 * (rounded to $0.25, floor $1.50) — real vend prices get set in the UI.
 * Idempotent by UPC. Routes through ProductService so normalization applies.
 *
 * Run: MONGODB_URI=... CSV=/path.csv bun scripts/importProductsCsv.ts
 */
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import {
  container,
  PRODUCT_SERVICE_TOKEN,
} from "../src/services/index.ts";
import { PRODUCT_DATA_CLIENT_TOKEN } from "@vendpire/platform";
import type { ProductDataClient } from "@vendpire/platform";
import { connectDatabase } from "@vendpire/platform/server";
import type { ProductService } from "../src/services/ProductService/ProductService.ts";

const uri = process.env.MONGODB_URI;
const csvPath = process.env.CSV;
if (!uri || !csvPath) {
  console.error("Set MONGODB_URI and CSV");
  process.exit(1);
}

// Minimal CSV parse: fields never contain escaped quotes in this file; the
// product column is quoted when it contains commas.
const parseLine = (line: string): string[] => {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
};

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/latte|shake|snapple|monster|celsius|red bull|alani|root beer|mountain dew|7up|coca|coke|pepsi|juice/i, "drinks"],
  [/sour patch|starburst|skittles|nerds|candy/i, "candy"],
  [/granola|kind|clif|bar\b|madegood/i, "bars"],
  [/cheetos|doritos|sun chips|fritos|frito|chester|skinnypop|popcorn|pretzel|chex|calbee|takis|pringles|crisps|chips/i, "chips"],
  [/jerky|yoggies|noodles/i, "snacks"],
];

const inferCategory = (name: string): string =>
  CATEGORY_RULES.find(([pattern]) => pattern.test(name))?.[1] ?? "snacks";

const PACK_SUFFIX = /\s*\((?:[^)]*\b(?:ct|pk|pack|bags|cans|bars|case)\b[^)]*)\)\s*$/i;
const COUNT_IN_DESC = /\((\d+)[\s-]*(?:ct|pk|pack|bags|cans|bars)\b/i;

const placeholderPriceCents = (casePriceCents: number, count: number | null): number => {
  if (!count) {
    return 175;
  }
  const unitCost = casePriceCents / count;
  const doubled = unitCost * 2;
  const quarters = Math.max(Math.round(doubled / 25) * 25, 150);
  return quarters;
};

await connectDatabase(uri);
const db = mongoose.connection.db!;
const anyDoc = await db.collection("machines").findOne({}, { projection: { orgId: 1 } })
  ?? await db.collection("locations").findOne({}, { projection: { orgId: 1 } });
if (!anyDoc?.orgId) {
  console.error("No orgId found in existing data — create a location first.");
  process.exit(1);
}
const orgId = anyDoc.orgId as string;
console.log("Importing into org", orgId);

const products = container.resolve<ProductService>(PRODUCT_SERVICE_TOKEN);
const catalog = container.resolve<ProductDataClient>(PRODUCT_DATA_CLIENT_TOKEN);
const existing = await products.list(orgId);
const existingUpcs = new Set(existing.map((p) => p.upc).filter(Boolean));

const lines = readFileSync(csvPath, "utf8").trim().split("\n");
let created = 0;
let skippedNoBarcode = 0;
let skippedExisting = 0;

for (const line of lines.slice(1)) {
  const [, , priceText, barcode, description] = parseLine(line);
  if (!barcode?.trim()) {
    if (description) {
      skippedNoBarcode += 1;
    }
    continue;
  }
  if (barcode === "barcode" || description === "product") {
    continue; // repeated header row
  }
  const upc = barcode.trim();
  if (existingUpcs.has(upc)) {
    skippedExisting += 1;
    continue;
  }

  const name = (description ?? "").replace(PACK_SUFFIX, "").trim() || upc;
  const casePriceCents = Math.round(Number.parseFloat(priceText ?? "0") * 100);
  const count = description?.match(COUNT_IN_DESC)?.[1];
  const defaultPriceCents = placeholderPriceCents(
    casePriceCents,
    count ? Number(count) : null,
  );

  // Case-level GTINs rarely exist in consumer catalogs, so fall back to a
  // name search and take the top hit's image.
  let imageUrl: string | null = null;
  try {
    imageUrl = (await catalog.lookupByUpc(upc))?.imageUrl ?? null;
    if (!imageUrl) {
      const searchName = name.replace(/\(.*?\)/g, "").split("—")[0]!.trim();
      const hits = await catalog.searchByName(searchName);
      imageUrl = hits.find((hit) => hit.imageUrl)?.imageUrl ?? null;
    }
  } catch {
    // Catalog hiccups shouldn't block a test-data import.
  }

  await products.create(orgId, {
    name,
    upc,
    category: inferCategory(name),
    taxClass: null,
    imageUrl,
    defaultPriceCents,
    active: true,
  });
  created += 1;
  console.log(
    `+ ${name} [${inferCategory(name)}] $${(defaultPriceCents / 100).toFixed(2)} img:${imageUrl ? "y" : "n"}`,
  );
}

console.log(
  `\ncreated ${created} · already-present ${skippedExisting} · no-barcode ${skippedNoBarcode}`,
);
await mongoose.disconnect();
process.exit(0);
