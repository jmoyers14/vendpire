import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ProductModel } from "../../models/Product.ts";
import { ProductRepositoryImpl } from "./ProductRepositoryImpl.ts";
import type { ProductInput } from "./ProductRepository.ts";

/**
 * The claims about products that only real MongoDB can settle: that
 * `findByIdsIncludingDeleted` really does ignore the soft-delete filter its
 * neighbours apply, and that the `tracksExpiration` schema default really
 * lands on a document the caller did not set it on.
 *
 * Skipped by default so a cold `bun run test` never pays for a mongod
 * download. Run it with `bun run test:integration`.
 */
const ENABLED = process.env.VENDPIRE_INTEGRATION === "1";

const ORG = "org_1";

describe.skipIf(!ENABLED)("ProductRepositoryImpl against MongoDB", () => {
  let mongo: MongoMemoryServer;
  let repo: ProductRepositoryImpl;

  const productInput = (over: Partial<ProductInput> = {}): ProductInput => ({
    name: "Doritos",
    upc: null,
    category: "snack",
    taxClass: null,
    imageUrl: null,
    defaultPriceCents: 175,
    active: true,
    tracksExpiration: true,
    ...over,
  });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    repo = new ProductRepositoryImpl();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await ProductModel.deleteMany({});
  });

  // A product pulled from the catalog but still sitting in a machine is
  // exactly the stock most likely to go bad, so the expiry report cannot use
  // a lookup that filters it out.
  it("findByIdsIncludingDeleted returns soft-deleted products", async () => {
    const live = await repo.create(ORG, productInput({ name: "Doritos" }));
    const retired = await repo.create(ORG, productInput({ name: "Zbar" }));
    await repo.softDelete(ORG, retired.id);

    const found = await repo.findByIdsIncludingDeleted(ORG, [
      live.id,
      retired.id,
    ]);
    expect(found.map((product) => product.name).sort()).toEqual([
      "Doritos",
      "Zbar",
    ]);
  });

  it("findByIdsIncludingDeleted stays inside the org", async () => {
    const mine = await repo.create(ORG, productInput({ name: "Doritos" }));
    const theirs = await repo.create("org_2", productInput({ name: "Zbar" }));

    const found = await repo.findByIdsIncludingDeleted(ORG, [
      mine.id,
      theirs.id,
    ]);
    expect(found.map((product) => product.name)).toEqual(["Doritos"]);
  });

  it("findByIdsIncludingDeleted returns nothing for an empty id list", async () => {
    expect(await repo.findByIdsIncludingDeleted(ORG, [])).toEqual([]);
  });

  it("defaults tracksExpiration to true", async () => {
    // Written WITHOUT the field, the way every pre-existing document is.
    const { tracksExpiration, ...withoutFlag } = productInput();
    const created = await repo.create(
      ORG,
      withoutFlag as unknown as ProductInput,
    );
    expect(created.tracksExpiration).toBe(true);
  });

  it("stores tracksExpiration false when asked", async () => {
    const created = await repo.create(
      ORG,
      productInput({ name: "Trident", tracksExpiration: false }),
    );
    expect(created.tracksExpiration).toBe(false);
  });
});
