/**
 * One-time migration (2026-10-18): convert every Mongo-native foreign key from
 * a BSON string to a real ObjectId.
 *
 * These paths were always 24-hex strings holding another document's `_id`, but
 * stored as `String`. `$lookup` compares raw BSON and has no cast step, so
 * "670f…" never matched ObjectId("670f…") — the join returned an empty array
 * with no error. Adding `ref:` alone would not have fixed that; it only makes
 * `populate()` work, which casts. Hence a data migration.
 *
 * NOT converted: `orgId`, `recordedByUserId` and `authUserId` are Clerk ids,
 * not this app's `_id`s, so there is nothing for them to point at.
 *
 * Run: MONGODB_URI=... bun scripts/migrateIdsToObjectId.ts
 *
 * Idempotent: only values whose BSON type is still `string` are touched, so a
 * re-run reports zero and a half-finished run can simply be run again.
 *
 * ORDERING: converted data and String-schema code are mutually unintelligible
 * — old code queries with a string and silently matches nothing. Take the app
 * down for this, then deploy the new code before bringing it back.
 */
import mongoose from "mongoose";

type Field = {
  collection: string;
  /** The queryable path. Dotted when the field sits in a subdocument array. */
  path: string;
  /** Set when `path` is inside an array, which has to be rebuilt to convert. */
  array?: string;
};

const FIELDS: Field[] = [
  { collection: "machines", path: "locationId" },
  { collection: "machines", path: "templateId" },
  { collection: "planograms", path: "machineId" },
  { collection: "visits", path: "machineId" },
  { collection: "visits", path: "locationId" },
  { collection: "visits", path: "planogramId" },
  { collection: "planograms", path: "slots.productId", array: "slots" },
  { collection: "packs", path: "contents.productId", array: "contents" },
  { collection: "purchases", path: "lines.productId", array: "lines" },
  { collection: "purchases", path: "lines.packId", array: "lines" },
  { collection: "visits", path: "lines.productId", array: "lines" },
];

/** No `i` flag: this goes to the server, and a 24-hex id is written lowercase. */
const HEX_24 = "^[0-9a-fA-F]{24}$";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db!;

/** Convert a top-level path in place. */
const convertScalar = async (collection: string, path: string): Promise<number> => {
  const result = await db.collection(collection).updateMany(
    { [path]: { $type: "string", $regex: HEX_24 } },
    [{ $set: { [path]: { $toObjectId: `$${path}` } } }],
  );
  return result.modifiedCount;
};

/**
 * Convert a path inside an array of subdocuments. `$toObjectId` can't be
 * applied through a dotted path, so the array is rebuilt with `$map`. The
 * `$cond` leaves nulls, absent keys and already-converted entries untouched,
 * which is what makes a re-run a no-op instead of an error.
 */
const convertInArray = async (
  collection: string,
  array: string,
  path: string,
): Promise<number> => {
  const key = path.slice(array.length + 1);
  const result = await db.collection(collection).updateMany({ [path]: { $type: "string" } }, [
    {
      $set: {
        [array]: {
          $map: {
            input: `$${array}`,
            as: "entry",
            in: {
              $mergeObjects: [
                "$$entry",
                {
                  [key]: {
                    $cond: [
                      {
                        $and: [
                          { $eq: [{ $type: `$$entry.${key}` }, "string"] },
                          { $regexMatch: { input: `$$entry.${key}`, regex: HEX_24 } },
                        ],
                      },
                      { $toObjectId: `$$entry.${key}` },
                      `$$entry.${key}`,
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },
  ]);
  return result.modifiedCount;
};

let converted = 0;
let unconvertible = 0;

for (const { collection, path, array } of FIELDS) {
  const modified = array
    ? await convertInArray(collection, array, path)
    : await convertScalar(collection, path);
  converted += modified;

  /**
   * Whatever is still a string after the pass is a value the old schema
   * permitted but that isn't a 24-hex id. Counting it AFTER converting is the
   * only honest check: a pre-flight query on an array path matches the
   * document, not the entry, so a line with one good and one bad id would
   * report clean and then convert half of itself.
   */
  const left = await db.collection(collection).countDocuments({ [path]: { $type: "string" } });
  unconvertible += left;

  const note = left > 0 ? `  ! ${left} document(s) still hold a non-hex string` : "";
  console.log(`${collection}.${path}: converted ${modified}${note}`);
}

console.log(`\nconverted ${converted} document(s), ${unconvertible} left unconvertible`);

await mongoose.disconnect();

// A left-behind string is a relationship that will silently never join, so it
// must not pass as a clean run.
if (unconvertible > 0) {
  process.exit(1);
}
