import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { LocationModel } from "./Location.ts";
import { MachineModel } from "./Machine.ts";
import { ProductModel } from "./Product.ts";
import { VisitModel } from "./Visit.ts";

/**
 * The claim no other test in this repo can make: that `$lookup` actually joins.
 *
 * This is the whole reason the foreign keys are ObjectIds rather than strings.
 * A `ref:` annotation over a String path still gives you a working
 * `populate()`, because Mongoose casts the local value before querying — so
 * every unit test, every repository test and the entire API would pass while
 * aggregation silently returned empty arrays. `$lookup` compares raw BSON and
 * has no cast step. Only a real pipeline against a real mongod can tell the
 * two situations apart.
 *
 * Skipped by default so a cold `bun run test` never pays for a mongod
 * download. Run it with `bun run test:integration`.
 */
const ENABLED = process.env.VENDPIRE_INTEGRATION === "1";

const ORG = "org_1";

describe.skipIf(!ENABLED)("ObjectId refs under $lookup", () => {
  let mongo: MongoMemoryServer;
  let machineId: mongoose.Types.ObjectId;
  let locationId: mongoose.Types.ObjectId;
  let productId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      VisitModel.deleteMany({}),
      MachineModel.deleteMany({}),
      LocationModel.deleteMany({}),
      ProductModel.deleteMany({}),
    ]);

    const location = await LocationModel.create({
      orgId: ORG,
      name: "Westside Gym",
      commission: { type: "none" },
    });
    locationId = location._id;

    const product = await ProductModel.create({
      orgId: ORG,
      name: "Coke",
      category: "drink",
      defaultPriceCents: 175,
    });
    productId = product._id;

    const machine = await MachineModel.create({
      orgId: ORG,
      locationId,
      name: "Front lobby",
      kind: "combo",
    });
    machineId = machine._id;

    await VisitModel.create({
      orgId: ORG,
      machineId,
      locationId,
      countedAt: new Date("2026-09-20T17:00:00.000Z"),
      recordedByUserId: "user_1",
      lines: [
        {
          slotCode: "A1",
          productId,
          remaining: 4,
          added: 6,
          priceCents: 175,
        },
      ],
      clientRequestId: "req_1",
    });
  });

  it("joins a visit to its machine", async () => {
    const rows = await VisitModel.aggregate([
      { $match: { orgId: ORG } },
      {
        $lookup: {
          from: MachineModel.collection.name,
          localField: "machineId",
          foreignField: "_id",
          as: "machine",
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].machine).toHaveLength(1);
    expect(rows[0].machine[0].name).toBe("Front lobby");
  });

  it("joins a visit through its machine to the location", async () => {
    const rows = await MachineModel.aggregate([
      { $match: { orgId: ORG } },
      {
        $lookup: {
          from: LocationModel.collection.name,
          localField: "locationId",
          foreignField: "_id",
          as: "location",
        },
      },
    ]);

    expect(rows[0].location[0].name).toBe("Westside Gym");
  });

  // The nested-path case: productId lives inside the lines subdocument array,
  // which is where a conversion is most likely to have been missed.
  it("joins visit lines to their products", async () => {
    const rows = await VisitModel.aggregate([
      { $match: { orgId: ORG } },
      { $unwind: "$lines" },
      {
        $lookup: {
          from: ProductModel.collection.name,
          localField: "lines.productId",
          foreignField: "_id",
          as: "product",
        },
      },
    ]);

    expect(rows[0].product[0].name).toBe("Coke");
  });

  // The regression guard. This is what the codebase did before the migration,
  // and the failure is silent: an empty array, never an error. If someone
  // reverts a path to String, the tests above go quiet rather than red — so
  // this one states the mechanism outright.
  it("matches nothing when the local value is a string, not an ObjectId", async () => {
    const rows = await VisitModel.aggregate([
      { $match: { orgId: ORG } },
      { $addFields: { machineIdAsString: { $toString: "$machineId" } } },
      {
        $lookup: {
          from: MachineModel.collection.name,
          localField: "machineIdAsString",
          foreignField: "_id",
          as: "machine",
        },
      },
    ]);

    expect(rows[0].machine).toEqual([]);
  });

  it("stores the foreign keys as objectId, not string", async () => {
    const typed = await VisitModel.collection.findOne({
      machineId: { $type: "objectId" },
      locationId: { $type: "objectId" },
      "lines.productId": { $type: "objectId" },
    });

    expect(typed).not.toBeNull();
  });

  it("casts a 24-hex string on the way in, so writes need no change", async () => {
    const found = await MachineModel.findOne({
      orgId: ORG,
      locationId: locationId.toHexString(),
    });

    expect(found?._id.toHexString()).toBe(machineId.toHexString());
    expect(found?.locationId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(productId).toBeInstanceOf(mongoose.Types.ObjectId);
  });
});
