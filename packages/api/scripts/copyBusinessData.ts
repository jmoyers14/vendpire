/**
 * Copies one business's data between databases, swapping the source Clerk
 * instance's org and user ids for the target's. Reads the source, never writes it.
 *
 * Two jobs (docs/plans/2026-11-13-zenvend-rename-and-cutover.md):
 *
 *   Cutover — old stack → new stack, remapped to the production Clerk instance:
 *     SOURCE_MONGODB_URI=... TARGET_MONGODB_URI=... TARGET_CLERK_SECRET_KEY=sk_live_... \
 *       bun scripts/copyBusinessData.ts --allow-remote-target [--apply] [--replace] [--verify]
 *
 *   Debugging — production → local, remapped to the dev instance (`bun run db:pull-prod`):
 *     bun scripts/copyBusinessData.ts --source-secret zenvend-mongodb-uri --target-local --apply --replace
 *
 * Users are matched by email: the source's `users` mirror (or SOURCE_CLERK_SECRET_KEY)
 * says who each id is, and the target's Clerk instance says who that is there.
 * Dry run unless --apply. --replace clears only the target org's documents.
 */
import { parseArgs } from "node:util";
import { createClerkClient } from "@clerk/backend";
import mongoose from "mongoose";
import {
  BUSINESS_COLLECTIONS,
  buildUserIdMap,
  describeMongoUri,
  isLocalMongoUri,
  resolveSourceOrgId,
  resolveTargetOrgId,
  toRemapped,
  type IdMapping,
  type Resolution,
} from "./copyBusinessData/mapping.ts";

const GCP_PROJECT = "vendpire-128694";
const GCLOUD_CONFIGURATION = "vendpire";
const INSERT_BATCH_SIZE = 500;

const { values: options } = parseArgs({
  options: {
    "source-secret": { type: "string" },
    "source-org": { type: "string" },
    "target-local": { type: "boolean", default: false },
    "target-org": { type: "string" },
    "allow-remote-target": { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    replace: { type: "boolean", default: false },
    verify: { type: "boolean", default: false },
  },
});

const fail = (message: string): never => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

const unwrap = <T>(resolution: Resolution<T>): T =>
  resolution.ok ? resolution.value : fail(resolution.problem);

const readSecret = (name: string): string => {
  const result = Bun.spawnSync([
    "gcloud", "secrets", "versions", "access", "latest",
    "--secret", name, "--project", GCP_PROJECT, "--configuration", GCLOUD_CONFIGURATION,
  ]);
  if (result.exitCode !== 0) {
    fail(`could not read secret ${name}: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
};

// Target settings come from TARGET_* or, with --target-local, from the api's own
// .env (which Bun loads from the cwd). Never a silent fallback to .env.
const sourceUri =
  options["source-secret"] !== undefined
    ? readSecret(options["source-secret"])
    : (process.env.SOURCE_MONGODB_URI ?? fail("set SOURCE_MONGODB_URI or pass --source-secret"));
const targetUri = options["target-local"]
  ? (process.env.MONGODB_URI ?? fail("--target-local needs MONGODB_URI in packages/api/.env"))
  : (process.env.TARGET_MONGODB_URI ?? fail("set TARGET_MONGODB_URI, or pass --target-local"));
const targetClerkKey = options["target-local"]
  ? (process.env.CLERK_SECRET_KEY ?? fail("--target-local needs CLERK_SECRET_KEY in packages/api/.env"))
  : (process.env.TARGET_CLERK_SECRET_KEY ?? fail("set TARGET_CLERK_SECRET_KEY"));

const source = describeMongoUri(sourceUri);
const target = describeMongoUri(targetUri);
if (source === target) {
  fail(`source and target are the same database (${source})`);
}
if (!isLocalMongoUri(targetUri) && !options["allow-remote-target"]) {
  fail(`target ${target} is not local; pass --allow-remote-target to write to it`);
}

console.log(`source  ${source}  (read only)`);
console.log(`target  ${target}`);

const sourceDb = (await mongoose.createConnection(sourceUri).asPromise()).db!;
const targetDb = (await mongoose.createConnection(targetUri).asPromise()).db!;
const targetClerk = createClerkClient({ secretKey: targetClerkKey });

// ── Mapping ─────────────────────────────────────────────────────────────────

const sourceOrgIds: string[] = [];
for (const collection of BUSINESS_COLLECTIONS) {
  const orgIds = await sourceDb.collection(collection).distinct("orgId");
  sourceOrgIds.push(...orgIds.map(String));
}
const sourceOrgId = unwrap(resolveSourceOrgId(sourceOrgIds, options["source-org"]));

const recordedByIds = (
  await sourceDb.collection("visits").distinct("recordedByUserId", { orgId: sourceOrgId })
).map(String);

const sourceEmailByUserId = new Map<string, string>();
const mirrored = await sourceDb
  .collection("users")
  .find({ authUserId: { $in: recordedByIds } })
  .toArray();
for (const user of mirrored) {
  if (typeof user.email === "string") {
    sourceEmailByUserId.set(String(user.authUserId), user.email);
  }
}
const sourceClerkKey = process.env.SOURCE_CLERK_SECRET_KEY;
if (sourceClerkKey !== undefined) {
  const sourceClerk = createClerkClient({ secretKey: sourceClerkKey });
  for (const userId of recordedByIds.filter((id) => !sourceEmailByUserId.has(id))) {
    const user = await sourceClerk.users.getUser(userId);
    const email = user.primaryEmailAddress?.emailAddress;
    if (email !== undefined) {
      sourceEmailByUserId.set(userId, email);
    }
  }
}

const emails = [...new Set(sourceEmailByUserId.values())].map((email) => email.toLowerCase());
const targetUserIdByEmail = new Map<string, string>();
if (emails.length > 0) {
  const { data: targetUsers } = await targetClerk.users.getUserList({ emailAddress: emails, limit: 100 });
  for (const user of targetUsers) {
    for (const address of user.emailAddresses) {
      targetUserIdByEmail.set(address.emailAddress.toLowerCase(), user.id);
    }
  }
}
const userIds = unwrap(buildUserIdMap({ sourceUserIds: recordedByIds, sourceEmailByUserId, targetUserIdByEmail }));

const orgIdsPerUser: string[][] = [];
for (const targetUserId of new Set(userIds.values())) {
  const { data: memberships } = await targetClerk.users.getOrganizationMembershipList({ userId: targetUserId });
  orgIdsPerUser.push(memberships.map((membership) => membership.organization.id));
}
const targetOrgId = unwrap(resolveTargetOrgId(orgIdsPerUser, options["target-org"]));

const mapping: IdMapping = { orgId: { from: sourceOrgId, to: targetOrgId }, userIds };
console.log(`\norg     ${sourceOrgId} → ${targetOrgId}`);
for (const [from, to] of userIds) {
  console.log(`user    ${from} → ${to}  (${sourceEmailByUserId.get(from)})`);
}

// ── Verify ──────────────────────────────────────────────────────────────────

const latestUpdatedAt = async (db: typeof sourceDb, collection: string, orgId: string) => {
  const [latest] = await db
    .collection(collection)
    .find({ orgId })
    .sort({ updatedAt: -1 })
    .limit(1)
    .project({ updatedAt: 1 })
    .toArray();
  return latest?.updatedAt instanceof Date ? latest.updatedAt.toISOString() : "—";
};

if (options.verify) {
  let isMatching = true;
  console.log("\ncollection          source  target  latest updatedAt (source / target)");
  for (const collection of BUSINESS_COLLECTIONS) {
    const [sourceCount, targetCount] = await Promise.all([
      sourceDb.collection(collection).countDocuments({ orgId: sourceOrgId }),
      targetDb.collection(collection).countDocuments({ orgId: targetOrgId }),
    ]);
    const [sourceLatest, targetLatest] = await Promise.all([
      latestUpdatedAt(sourceDb, collection, sourceOrgId),
      latestUpdatedAt(targetDb, collection, targetOrgId),
    ]);
    const isRowMatching = sourceCount === targetCount && sourceLatest === targetLatest;
    isMatching &&= isRowMatching;
    console.log(
      `${isRowMatching ? " " : "✖"} ${collection.padEnd(17)} ${String(sourceCount).padStart(6)}  ${String(targetCount).padStart(6)}  ${sourceLatest} / ${targetLatest}`,
    );
  }
  console.log(isMatching ? "\n✔ target matches source" : "\n✖ target differs from source");
  process.exit(isMatching ? 0 : 1);
}

// ── Copy ────────────────────────────────────────────────────────────────────

console.log("\ncollection          copy  in target now");
const plan: { collection: (typeof BUSINESS_COLLECTIONS)[number]; documents: Record<string, unknown>[] }[] = [];
for (const collection of BUSINESS_COLLECTIONS) {
  const documents = await sourceDb.collection(collection).find({ orgId: sourceOrgId }).toArray();
  const remapped = documents.map((document) => toRemapped(collection, document, mapping));
  const existing = await targetDb.collection(collection).countDocuments({ orgId: targetOrgId });

  // An _id already in the target under another org would collide on insert.
  const ids = documents.map((document) => document._id);
  const foreign = await targetDb
    .collection(collection)
    .countDocuments({ _id: { $in: ids }, orgId: { $ne: targetOrgId } });
  if (foreign > 0) {
    fail(`${collection}: ${foreign} documents already exist in the target under another org`);
  }
  if (existing > 0 && !options.replace) {
    fail(`${collection}: the target org already has ${existing} documents; pass --replace to clear them first`);
  }
  plan.push({ collection, documents: remapped });
  console.log(`  ${collection.padEnd(17)} ${String(remapped.length).padStart(5)}  ${String(existing).padStart(6)}`);
}

if (!options.apply) {
  console.log("\nDry run. Pass --apply to write.");
  process.exit(0);
}

for (const { collection, documents } of plan) {
  const targetCollection = targetDb.collection(collection);
  if (options.replace) {
    await targetCollection.deleteMany({ orgId: targetOrgId });
  }
  for (let start = 0; start < documents.length; start += INSERT_BATCH_SIZE) {
    await targetCollection.insertMany(documents.slice(start, start + INSERT_BATCH_SIZE));
  }
}
console.log(`\n✔ copied into ${target}. Check it with --verify.`);
process.exit(0);
