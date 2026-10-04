/**
 * Dev tool: show what Open Food Facts actually returns for a barcode, next to
 * the narrowed ProductData our client keeps. Useful while building scan-first
 * purchase entry, where the server drops all but name/brand/image before the
 * response ever reaches the browser — so a console.log in the web app can't
 * show you this.
 *
 * Unlike the rest of the app this script talks to OFF's URL directly: the
 * ProductDataClient port is deliberately vendor-neutral and has no "give me
 * the raw payload" method, and adding one would widen a production interface
 * for a debugging affordance. Hence the vendor name in the filename.
 *
 * Run (from packages/api):
 *   bun scripts/inspectOpenFoodFacts.ts 00049000006346
 *   bun scripts/inspectOpenFoodFacts.ts --full 04026305 0028400087926
 */
import { normalizeGtin } from "@vendpire/domain";
import { PRODUCT_DATA_CLIENT_TOKEN } from "@vendpire/platform";
import type { ProductDataClient } from "@vendpire/platform";
import { container } from "../src/services/index.ts";

const BASE_URL = "https://world.openfoodfacts.org/api/v2/product";
const USER_AGENT = "vendpire-inspect/0.1 (vending route tracker; dev tool)";

const args = process.argv.slice(2);
const full = args.includes("--full") || args.includes("-f");
const codes = args.filter((arg) => !arg.startsWith("-"));

if (codes.length === 0) {
  console.error("Usage: bun scripts/inspectOpenFoodFacts.ts [--full] <barcode...>");
  process.exit(1);
}

const catalog = container.resolve<ProductDataClient>(PRODUCT_DATA_CLIENT_TOKEN);

/** Raw OFF record with NO ?fields= filter — the whole point of this script. */
const fetchRaw = async (code: string): Promise<Record<string, unknown> | null> => {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(code)}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    console.log(`  HTTP ${res.status}`);
    return null;
  }
  const json = (await res.json()) as { status?: number; product?: Record<string, unknown> };
  return json.status === 1 && json.product ? json.product : null;
};

// Fields worth seeing at a glance; everything else is listed by key name only.
const INTERESTING = [
  "product_name", "product_name_en", "generic_name", "brands", "quantity",
  "product_quantity", "serving_size", "categories", "countries", "ingredients_text",
  "nova_group", "nutriscore_grade", "completeness", "image_front_url", "image_url",
  "image_front_small_url", "image_front_thumb_url", "last_modified_t", "scans_n",
];

for (const raw of codes) {
  console.log(`\n${"=".repeat(68)}\n${raw}\n${"=".repeat(68)}`);

  const normalized = normalizeGtin(raw);
  if (!normalized) {
    console.log("✗ normalizeGtin → null (bad check digit or unsupported length)");
    continue;
  }
  const { gtin14, format, likelyCase } = normalized;
  console.log(`gtin14=${gtin14}  format=${format}  likelyCase=${likelyCase}`);

  // The resolver always queries with gtin14, so that's the lookup that decides
  // candidate-vs-unknown in the UI.
  const product = await fetchRaw(gtin14);

  if (!product) {
    console.log(`\n✗ not found in OFF as ${gtin14} → the UI shows "unknown"`);
    // UPC-E expansion changes the digits, not just zero-padding, so OFF may
    // hold the record only under the compressed spelling.
    if (gtin14 !== raw.replace(/\D/g, "")) {
      const asTyped = await fetchRaw(raw.replace(/\D/g, ""));
      if (asTyped) {
        console.log(
          `! but FOUND as typed (${raw.replace(/\D/g, "")}): "${asTyped.product_name}"\n` +
            "  → catalog gap: resolve() only ever asks for the expanded form.",
        );
      }
    }
    continue;
  }

  const keys = Object.keys(product);
  console.log(`\n✓ found — ${keys.length} fields on product\n`);

  if (full) {
    console.log(JSON.stringify(product, null, 2));
  } else {
    for (const key of INTERESTING) {
      if (product[key] !== undefined) {
        console.log(`  ${key.padEnd(24)} ${JSON.stringify(product[key])}`);
      }
    }
    const rest = keys.filter((key) => !INTERESTING.includes(key)).sort();
    console.log(`\n  ${rest.length} other field(s) (--full to dump):\n  ${rest.join(" ")}`);
  }

  // What survives the narrowing — this is all the browser ever sees.
  console.log("\n  ProductData our client keeps:");
  console.log(
    `${JSON.stringify(await catalog.lookupByUpc(gtin14), null, 2)
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n")}`,
  );
}
