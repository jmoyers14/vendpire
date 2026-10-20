/**
 * Write one org's reference data to `ios/Vendpire/Fixtures/sample-org.json`,
 * the fixture the iOS app renders from.
 *
 * Reads through the repositories rather than the collections, so the output is
 * the entity shape the services return — the same shape the API serializes.
 *
 * Planograms come from `findCurrentByOrg`: the current version per machine, not
 * the full history, which is all a face grid can render.
 *
 * Run: MONGODB_URI=... bun scripts/exportIosFixture.ts <orgId>
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { container } from "../src/services/index.ts";
import {
  LOCATION_REPOSITORY_TOKEN,
  MACHINE_REPOSITORY_TOKEN,
  PACK_REPOSITORY_TOKEN,
  PLANOGRAM_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  LocationRepository,
  MachineRepository,
  PackRepository,
  PlanogramRepository,
  ProductRepository,
} from "@vendpire/platform";
import { connectDatabase } from "@vendpire/platform/server";
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
const orgId = process.argv[2];

if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}
if (!orgId) {
  console.error("Usage: bun scripts/exportIosFixture.ts <orgId>");
  process.exit(1);
}

const OUTPUT_PATH = resolve(
  import.meta.dir,
  "../../../ios/Vendpire/Fixtures/sample-org.json",
);

await connectDatabase(uri);

const locations = container.resolve<LocationRepository>(
  LOCATION_REPOSITORY_TOKEN,
);
const machines = container.resolve<MachineRepository>(MACHINE_REPOSITORY_TOKEN);
const products = container.resolve<ProductRepository>(PRODUCT_REPOSITORY_TOKEN);
const packs = container.resolve<PackRepository>(PACK_REPOSITORY_TOKEN);
const planograms = container.resolve<PlanogramRepository>(
  PLANOGRAM_REPOSITORY_TOKEN,
);

const [
  exportedLocations,
  exportedMachines,
  exportedProducts,
  exportedPacks,
  exportedPlanograms,
] = await Promise.all([
  locations.findByOrg(orgId),
  machines.findByOrg(orgId),
  products.findByOrg(orgId),
  packs.findByOrg(orgId),
  planograms.findCurrentByOrg(orgId),
]);

// Recorded once here and nowhere on the entities: the device holds exactly one
// org, so a cross-org leak has no field to travel through.
const fixture = {
  orgId,
  exportedAt: new Date().toISOString(),
  locations: exportedLocations,
  machines: exportedMachines,
  products: exportedProducts,
  packs: exportedPacks,
  planograms: exportedPlanograms,
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`);

const machinesWithoutPlanogram = exportedMachines.filter(
  (machine) => !exportedPlanograms.some((plan) => plan.machineId === machine.id),
);

console.log(`wrote ${OUTPUT_PATH}`);
console.log(
  `  locations ${exportedLocations.length}  machines ${exportedMachines.length}` +
    `  products ${exportedProducts.length}  packs ${exportedPacks.length}` +
    `  planograms ${exportedPlanograms.length}`,
);

// An all-empty face grid looks identical to a broken one.
if (machinesWithoutPlanogram.length > 0) {
  console.log(
    `  ⚠ ${machinesWithoutPlanogram.length} machine(s) have no current planogram: ` +
      machinesWithoutPlanogram.map((machine) => machine.name).join(", "),
  );
}

await mongoose.disconnect();
