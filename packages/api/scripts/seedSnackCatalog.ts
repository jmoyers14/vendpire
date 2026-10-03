/**
 * Seed a hand-curated snack catalog (products + case packs + the purchases
 * that carry their case costs) for one org. Test data for a real Frito-Lay /
 * candy / pastry machine fill.
 *
 * Each row becomes:
 *  - a Product, named "<name> <size> oz", carrying the UNIT upc;
 *  - a Pack named "<product> — case (N)", carrying the CASE gtin, whose
 *    contents are N units of that product;
 *  - a pack line on one Purchase per vendor, so the case cost lands as a
 *    purchase fact and weighted-average unit cost can be derived from it.
 *
 * `defaultPriceCents` is a PLACEHOLDER (~2x unit cost, rounded to $0.25,
 * floor $1.50) — real vend prices get set in the UI.
 *
 * Idempotent: a row is skipped when its unit upc (or, lacking one, its exact
 * product name) is already in the org; a pack is skipped when its case gtin
 * (or name) is already there; a vendor's purchase is skipped when a purchase
 * from that vendor on that date already exists.
 *
 * Run: MONGODB_URI=... ORG_ID=org_... bun scripts/seedSnackCatalog.ts
 */
import mongoose from "mongoose";
import { PRODUCT_DATA_CLIENT_TOKEN } from "@vendpire/platform";
import type { ProductDataClient } from "@vendpire/platform";
import { connectDatabase } from "@vendpire/platform/server";
import {
  container,
  PACK_SERVICE_TOKEN,
  PRODUCT_SERVICE_TOKEN,
  PURCHASE_SERVICE_TOKEN,
} from "../src/services/index.ts";
import type { PackService } from "../src/services/PackService/PackService.ts";
import type { ProductService } from "../src/services/ProductService/ProductService.ts";
import type {
  PurchasePackLine,
  PurchaseService,
} from "../src/services/PurchaseService/PurchaseService.ts";

interface SeedRow {
  /** Machine slot the item was photographed in — recorded for reference only;
   * slots live on a planogram, which needs a machine this seed doesn't touch. */
  slot: string;
  name: string;
  sizeOz: number;
  category: string;
  unitUpc: string | null;
  caseGtin: string | null;
  caseQty: number;
  caseCostUsd: number;
  /** Where the case price came from — becomes the purchase vendor. */
  vendor: string;
  /** Confidence that the photo was identified correctly; logged, not stored. */
  confidence: "confirmed" | "likely" | "best_guess";
  notes: string;
}

const PURCHASED_AT = "2026-10-03";

const ROWS: SeedRow[] = [
  {
    slot: "A0",
    name: "Ruffles Cheddar & Sour Cream Potato Chips",
    sizeOz: 1.5,
    category: "chips",
    unitUpc: "028400753647",
    caseGtin: "00028400443654",
    caseQty: 64,
    caseCostUsd: 66.95,
    vendor: "FoodServiceDirect",
    confidence: "likely",
    notes: "Orange bag in A0; flavor inferred from color",
  },
  {
    slot: "A2",
    name: "Lay's Classic Potato Chips",
    sizeOz: 1.5,
    category: "chips",
    unitUpc: "028400091565",
    caseGtin: "00028400443593",
    caseQty: 64,
    caseCostUsd: 55.99,
    vendor: "WebstaurantStore",
    confidence: "confirmed",
    notes: "",
  },
  {
    slot: "A6",
    name: "Doritos Nacho Cheese Tortilla Chips",
    sizeOz: 1.75,
    category: "chips",
    unitUpc: "028400070560",
    caseGtin: "00028400443753",
    caseQty: 64,
    caseCostUsd: 61.99,
    vendor: "WebstaurantStore",
    confidence: "confirmed",
    notes: "",
  },
  {
    slot: "A8",
    name: "Doritos Cool Ranch Tortilla Chips",
    sizeOz: 1.75,
    category: "chips",
    unitUpc: "028400070546",
    caseGtin: "00028400443746",
    caseQty: 64,
    caseCostUsd: 61.99,
    vendor: "WebstaurantStore",
    confidence: "confirmed",
    notes: "",
  },
  {
    slot: "B4",
    name: "Lay's Sour Cream & Onion Potato Chips",
    sizeOz: 1.5,
    category: "chips",
    unitUpc: "028400001748",
    caseGtin: "00028400443616",
    caseQty: 64,
    caseCostUsd: 61.99,
    vendor: "WebstaurantStore",
    confidence: "confirmed",
    notes: "",
  },
  {
    slot: "B6",
    name: "Fritos Original Corn Chips",
    sizeOz: 2,
    category: "chips",
    unitUpc: "028400047937",
    caseGtin: "00028400443555",
    caseQty: 64,
    caseCostUsd: 60.49,
    vendor: "WebstaurantStore",
    confidence: "likely",
    notes: "Red Fritos bag; could be another Fritos flavor",
  },
  {
    slot: "C0",
    name: "SunChips Harvest Cheddar",
    sizeOz: 1.5,
    category: "chips",
    unitUpc: "028400073264",
    caseGtin: "00028400444279",
    caseQty: 64,
    caseCostUsd: 64.99,
    vendor: "WebstaurantStore",
    confidence: "confirmed",
    notes: "",
  },
  {
    slot: "C2",
    name: "SunChips Garden Salsa",
    sizeOz: 1.5,
    category: "chips",
    unitUpc: "028400753623",
    caseGtin: "00028400444286",
    caseQty: 64,
    caseCostUsd: 64.99,
    vendor: "WebstaurantStore",
    confidence: "likely",
    notes: "Red SunChips bag; flavor inferred from color",
  },
  {
    slot: "C8",
    name: "Munchies Cheese Fix Snack Mix",
    sizeOz: 1.75,
    category: "snacks",
    unitUpc: "028400025287",
    caseGtin: "00028400443876",
    caseQty: 64,
    caseCostUsd: 65.95,
    vendor: "FoodServiceDirect",
    confidence: "best_guess",
    notes: "Munchies bag visible; flavor guessed. Case gtin unverified (eBay)",
  },
  {
    slot: "D0",
    name: "Reese's Peanut Butter Cups",
    sizeOz: 1.5,
    category: "candy",
    unitUpc: "034000004409",
    caseGtin: "00034000440009",
    caseQty: 36,
    caseCostUsd: 58.99,
    vendor: "WebstaurantStore",
    confidence: "confirmed",
    notes: "Case = 36-ct display box",
  },
  {
    slot: "D2",
    name: "Skittles Original",
    sizeOz: 2.17,
    category: "candy",
    unitUpc: "040000001607",
    caseGtin: null,
    caseQty: 36,
    caseCostUsd: 54.99,
    vendor: "WebstaurantStore",
    confidence: "confirmed",
    notes: "Case = 36-ct box; box GTIN not found",
  },
  {
    slot: "D3",
    name: "Twix Caramel Cookie Bar",
    sizeOz: 1.79,
    category: "candy",
    unitUpc: "040000004356",
    caseGtin: "00040000353911",
    caseQty: 36,
    caseCostUsd: 51.49,
    vendor: "WebstaurantStore",
    confidence: "likely",
    notes: "Case = 36-ct box",
  },
  {
    slot: "D4",
    name: "Kit Kat Milk Chocolate Wafer Bar",
    sizeOz: 1.5,
    category: "candy",
    unitUpc: "034000002467",
    caseGtin: "00034000246007",
    caseQty: 36,
    caseCostUsd: 69.99,
    vendor: "WebstaurantStore",
    confidence: "likely",
    notes: "Case = 36-ct box",
  },
  {
    slot: "D5",
    name: "Snickers Bar",
    sizeOz: 1.86,
    category: "candy",
    unitUpc: "040000424314",
    caseGtin: "00040000524311",
    caseQty: 48,
    caseCostUsd: 68.49,
    vendor: "WebstaurantStore",
    confidence: "best_guess",
    notes: "Case = 48-ct box; slot guessed",
  },
  {
    slot: "E6",
    name: "Corn Nuts Original",
    sizeOz: 1.7,
    category: "snacks",
    unitUpc: "071159001330",
    caseGtin: "00071159021338",
    caseQty: 18,
    caseCostUsd: 30.25,
    vendor: "Triple Net Pricing",
    confidence: "likely",
    notes:
      "Price may be per 18-ct box; master case is 12 boxes, so verify before relying on it",
  },
  {
    slot: "F2",
    name: "Pop-Tarts Frosted Strawberry (2 ct)",
    sizeOz: 3.3,
    category: "snacks",
    unitUpc: "038000317316",
    caseGtin: "00038000317323",
    caseQty: 72,
    caseCostUsd: 64.99,
    vendor: "WebstaurantStore",
    confidence: "likely",
    notes: "Photo pack may be a different flavor or size",
  },
  {
    slot: "F4",
    name: "Famous Amos Chocolate Chip Cookies",
    sizeOz: 2,
    category: "snacks",
    unitUpc: null,
    caseGtin: "10076677980164",
    caseQty: 60,
    caseCostUsd: 42.49,
    vendor: "WebstaurantStore",
    confidence: "confirmed",
    notes: "Unit UPC not found",
  },
  {
    slot: "F8",
    name: "Big Texas Cinnamon Roll",
    sizeOz: 4,
    category: "snacks",
    unitUpc: "085264043703",
    caseGtin: "00085264790027",
    caseQty: 12,
    caseCostUsd: 30.49,
    vendor: "OfficeCrave",
    confidence: "confirmed",
    notes: "Case = 12-ct box",
  },
];

const uri = process.env.MONGODB_URI;
const orgId = process.env.ORG_ID;
if (!uri || !orgId) {
  console.error("Set MONGODB_URI and ORG_ID");
  process.exit(1);
}

const productName = (row: SeedRow): string => `${row.name} ${row.sizeOz} oz`;
const packName = (row: SeedRow): string =>
  `${productName(row)} — case (${row.caseQty})`;

/** Placeholder vend price: ~2x unit cost, rounded to $0.25, floor $1.50. */
const placeholderPriceCents = (row: SeedRow): number => {
  const unitCostCents = (row.caseCostUsd * 100) / row.caseQty;
  return Math.max(Math.round((unitCostCents * 2) / 25) * 25, 150);
};

/**
 * Case GTINs are almost never in a consumer catalog, so look the image up by
 * the unit upc and fall back to a name search. Catalog hiccups must not block
 * a test-data seed.
 */
const findImageUrl = async (
  catalog: ProductDataClient,
  row: SeedRow,
): Promise<string | null> => {
  try {
    if (row.unitUpc) {
      const hit = await catalog.lookupByUpc(row.unitUpc);
      if (hit?.imageUrl) {
        return hit.imageUrl;
      }
    }
    const hits = await catalog.searchByName(row.name);
    return hits.find((hit) => hit.imageUrl)?.imageUrl ?? null;
  } catch {
    return null;
  }
};

await connectDatabase(uri);
console.log(`Seeding ${ROWS.length} rows into org ${orgId}\n`);

const products = container.resolve<ProductService>(PRODUCT_SERVICE_TOKEN);
const packs = container.resolve<PackService>(PACK_SERVICE_TOKEN);
const purchases = container.resolve<PurchaseService>(PURCHASE_SERVICE_TOKEN);
const catalog = container.resolve<ProductDataClient>(PRODUCT_DATA_CLIENT_TOKEN);

const existingProducts = await products.list(orgId);
const existingPacks = await packs.list(orgId);
const existingPurchases = await purchases.list(orgId);

// Products created or already present, keyed by name — packs need their ids.
const productIdByName = new Map(
  existingProducts.map((product) => [product.name, product.id]),
);
const packIdByName = new Map(
  existingPacks.map((pack) => [pack.name, pack.id]),
);
// Unit upcs are stored as GTIN-14, so compare on the padded form.
const takenUpcs = new Set(
  existingProducts.map((product) => product.upc).filter(Boolean),
);
const takenBarcodes = new Set(existingPacks.flatMap((pack) => pack.barcodes));
const asGtin14 = (code: string): string => code.padStart(14, "0");

const packLinesByVendor = new Map<string, PurchasePackLine[]>();
const counts = {
  productsCreated: 0,
  productsExisting: 0,
  packsCreated: 0,
  packsExisting: 0,
};

for (const row of ROWS) {
  const name = productName(row);
  const alreadyThere =
    productIdByName.has(name) ||
    (row.unitUpc !== null && takenUpcs.has(asGtin14(row.unitUpc)));

  if (alreadyThere) {
    counts.productsExisting += 1;
    console.log(`= ${name}`);
  } else {
    const imageUrl = await findImageUrl(catalog, row);
    const priceCents = placeholderPriceCents(row);
    const created = await products.create(orgId, {
      name,
      upc: row.unitUpc,
      category: row.category,
      taxClass: null,
      imageUrl,
      defaultPriceCents: priceCents,
      active: true,
    });
    productIdByName.set(name, created.id);
    counts.productsCreated += 1;
    console.log(
      `+ ${name} [${row.category}] $${(priceCents / 100).toFixed(2)} img:${imageUrl ? "y" : "n"} (${row.slot}, ${row.confidence})`,
    );
  }

  const productId = productIdByName.get(name);
  if (!productId) {
    throw new Error(`No product id for "${name}"`);
  }

  const caseName = packName(row);
  const packExists =
    packIdByName.has(caseName) ||
    (row.caseGtin !== null && takenBarcodes.has(asGtin14(row.caseGtin)));

  if (packExists) {
    counts.packsExisting += 1;
    console.log(`  = ${caseName}`);
  } else {
    const createdPack = await packs.create(orgId, {
      name: caseName,
      barcodes: row.caseGtin ? [row.caseGtin] : [],
      contents: [{ productId, units: row.caseQty }],
      active: true,
    });
    packIdByName.set(caseName, createdPack.id);
    counts.packsCreated += 1;
    console.log(
      `  + ${caseName} barcode:${row.caseGtin ?? "none"} × ${row.caseQty}`,
    );
  }

  const packId = packIdByName.get(caseName);
  if (!packId) {
    throw new Error(`No pack id for "${caseName}"`);
  }
  const lines = packLinesByVendor.get(row.vendor) ?? [];
  lines.push({
    packId,
    qty: 1,
    totalCostCents: Math.round(row.caseCostUsd * 100),
  });
  packLinesByVendor.set(row.vendor, lines);

  if (row.notes) {
    console.log(`    note: ${row.notes}`);
  }
}

// One purchase per price source — Purchase carries a single vendor, and the
// case costs came from four different sellers. The service expands each pack
// line into per-product unit lines, which is what the cost engine reads.
console.log("");
let purchasesCreated = 0;
let purchasesExisting = 0;
for (const [vendor, packLines] of packLinesByVendor) {
  const duplicate = existingPurchases.find(
    (purchase) =>
      purchase.vendor === vendor &&
      purchase.purchasedAt.slice(0, 10) === PURCHASED_AT,
  );
  if (duplicate) {
    purchasesExisting += 1;
    console.log(`= purchase ${vendor} ${PURCHASED_AT} (${duplicate.id})`);
    continue;
  }
  const total = packLines.reduce((sum, line) => sum + line.totalCostCents, 0);
  await purchases.create(orgId, {
    purchasedAt: `${PURCHASED_AT}T00:00:00.000Z`,
    vendor,
    lines: [],
    packLines,
    receiptTotalCents: total,
    notes: "Seeded test data — list prices, not a real receipt",
  });
  purchasesCreated += 1;
  console.log(
    `+ purchase ${vendor}: ${packLines.length} case(s), $${(total / 100).toFixed(2)}`,
  );
}

console.log(
  `\nproducts +${counts.productsCreated} (=${counts.productsExisting}) · ` +
    `packs +${counts.packsCreated} (=${counts.packsExisting}) · ` +
    `purchases +${purchasesCreated} (=${purchasesExisting})`,
);
await mongoose.disconnect();
process.exit(0);
