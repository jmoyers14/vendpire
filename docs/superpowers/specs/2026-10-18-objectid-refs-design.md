# ObjectId refs for document relationships

> **Status:** design of record as of 2026-10-18. Changes the stored BSON type of
> every Mongo-native foreign key. Additive to no feature — this is a storage
> correctness and capability change.

## Goal

**Make the relationships between documents real to MongoDB, so aggregation
pipelines can join on them.**

Today every foreign key is a `String`. A `$lookup` comparing `"670f…"` against
`ObjectId("670f…")` matches nothing — silently, with no error. The goal is that
a pipeline can join `Visit` → `Machine` → `Location`, and that `ref:` documents
what each id points at.

### Why now

Three drivers, in the order they were raised:

1. **New aggregation reports.** Sales, COGS and profit rollups that group across
   visits, products and locations are awkward to express as in-JS joins.
2. **Ad-hoc exploration.** Compass, `mongosh` and the MCP tools can follow a
   relationship only if the BSON types match.
3. **Schema self-documentation.** The model should declare what an id points at,
   independent of whether anything joins on it today.

Notably **not** a driver: collapsing round-trips in existing reports. That
decision is what keeps §6 out of scope.

### Was the current state deliberate?

No written decision rejects refs. What is written down is the thing that
produced the current state: the repository boundary returns plain data "free of
Mongoose types" (`MachineRepository/types.ts`), every entity exposes
`id: string`, and joins happen in the service layer — `loadMachinesById` /
`loadLocationsById` / `loadProductsById` in `VisitServiceImpl.ts:269-296`,
extracted deliberately in 758875a. The absence of refs reads as a *consequence*
of that boundary, not a considered rejection of `$lookup`.

## The load-bearing fact

**Adding `ref:` alone does not enable `$lookup`.**

`ref:` on a `String` path makes `populate()` work, because Mongoose casts the
local value to the referenced model's `_id` type when it builds the query.
`$lookup` has no such layer — it compares raw BSON. So this change is a **data
migration**, and the schema annotation is the smaller half of it.

## Scope

### Converting — 11 fields across 6 models

| Model | Field | `ref` |
|---|---|---|
| `Machine` | `locationId` | `Location` |
| `Machine` | `templateId` | `MachineTemplate` |
| `Planogram` | `machineId` | `Machine` |
| `Planogram` | `slots[].productId` | `Product` |
| `Pack` | `contents[].productId` | `Product` |
| `Purchase` | `lines[].productId` | `Product` |
| `Purchase` | `lines[].packId` | `Pack` |
| `Visit` | `machineId` | `Machine` |
| `Visit` | `locationId` | `Location` |
| `Visit` | `planogramId` | `Planogram` |
| `Visit` | `lines[].productId` | `Product` |

Existing indexes are unaffected — an index definition does not care about the
path's BSON type.

### Not converting — external identity strings

These are not Mongo `_id`s and can never be refs. `orgId` gets a one-line
comment saying so on `Organization.ts`, because "why isn't this one a ref too"
is the first question a reader will have.

| Field | What it actually is |
|---|---|
| `orgId` (every collection) | Clerk org id, `org_xxx` — the tenant key |
| `Visit.recordedByUserId` | Clerk user id, `user_xxx`, from the session |
| `User.authUserId`, `OrganizationMembership.authUserId` | Clerk user id |
| `WebhookEvent.sourceEventId` | The provider's delivery id (svix) |
| `clientRequestId` (Visit, Purchase) | Client-minted idempotency key |
| `Machine.tagCode` | What the QR/NFC sticker encodes |
| `Machine.cardReader.deviceId` | Nayax / Cantaloupe device id |

### Provenance fields get refs too

`Visit.planogramId`, `Machine.templateId` and `Purchase.lines[].packId` carry
comments forbidding the traversal that `ref:` appears to advertise — *"the
engine never reads a planogram"*, *"never resolved through the template"*,
*"provenance only"*.

They still get `ref:`. The relationship genuinely exists; `ref:` documents it
without causing anything, since `populate()` is opt-in. The existing comments
remain the carrier of the "do not traverse" rule, and must be preserved verbatim
through the edit.

## Design

### 1. Repository boundary — contract unchanged

Domain types keep `id: string` and `locationId: string`. The iOS client is
unaffected for the same reason: ids stay `String` over JSON.

The `*Doc` types change to `Types.ObjectId`; the `toX` mappers stringify. Writes
need no change — Mongoose casts a valid 24-hex string on the way in.

Six impls, these mapper lines:

| File | Lines |
|---|---|
| `MachineRepositoryImpl.ts` | 97, 104 |
| `VisitRepositoryImpl.ts` | 224, 225, 226, 231 |
| `PlanogramRepositoryImpl.ts` | 66, 70 |
| `PurchaseRepositoryImpl.ts` | 113, 163, 166 |
| `PackRepositoryImpl.ts` | 78 |

### 2. The shared `toId` helper

A new `packages/platform/src/data-access/repositories/ids.ts`. The name matches
the sibling mappers already in this layer (`toMachine`, `toVisit`, `toPurchase`).

```ts
import { Types } from "mongoose";

/**
 * An ObjectId as the plain string the domain layer speaks. Overloaded on the
 * argument, not the return type: a required path yields `string`, a nullable
 * one `string | null`, so the call site reads the same either way.
 */
export function toId(value: Types.ObjectId): string;
export function toId(value: Types.ObjectId | null | undefined): string | null;
export function toId(value: Types.ObjectId | null | undefined): string | null {
  return value ? value.toHexString() : null;
}
```

**This helper exists to prevent one specific bug.** The nullable paths currently
read `doc.templateId ?? null`. Wrapped carelessly during the edit that becomes
`String(doc.templateId ?? null)`, which evaluates to the string `"null"` — it
typechecks, every existing test passes, and the data is quietly poisoned. Three
fields are exposed to it: `templateId`, `planogramId`, `packId`.

`_id` is converted too. The Doc types declare `_id: unknown` today and the
mappers call `String(doc._id)`; both tighten to `Types.ObjectId` and `toId`, so
there is exactly one way an id crosses this boundary.

### 3. API boundary — the `objectId()` validator

Today every id input is `z.string().min(1)`, which means `create({ locationId:
"nope" })` currently succeeds and stores garbage. Once the path is an ObjectId
that same call raises a Mongoose CastError, surfacing as a 500.

A new `packages/api/src/routers/validators.ts`:

```ts
export const objectId = () =>
  z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex id");
```

It replaces all 36 `z.string().min(1)` id fields, across every router that
takes one:

| Router | Fields |
|---|---|
| `visits.ts` | 8 |
| `purchases.ts` | 6 |
| `machines.ts` | 5 |
| `packs.ts` | 4 |
| `planograms.ts` | 4 |
| `locations.ts` | 3 |
| `machineTemplates.ts` | 3 |
| `products.ts` | 3 |

A malformed id becomes a 400 at the boundary instead of a 500 in the
repository, and the silent-garbage hole closes.

`locations`, `products` and `machineTemplates` own no foreign keys, but their
`byId` / `update` / `delete` params are still `_id` lookups and still
CastError on a malformed value today — so they are in scope for the validator
even though they are out of scope for the migration.

It is **not** applied to `clientRequestId` (8–64 chars, client-minted) or
`cardReader.deviceId`.

### 4. Migration — `packages/api/scripts/migrateIdsToObjectId.ts`

Follows the existing one-off script convention (`migrateMachineSlots.ts`,
`migratePackagingsToPacks.ts`, `backfillPurchaseClientRequestIds.ts`).

Requirements:

- **Idempotent.** Convert only values whose BSON `$type` is `string`, so a
  re-run is a no-op and a half-finished run can be resumed.
- **Tolerant of bad data.** Today's schema permitted values that are not 24-hex.
  Any such value is reported and skipped, not crashed on. The script exits
  non-zero if it skipped anything, so a dirty collection cannot pass unnoticed.
- **Covers nested paths.** `Planogram.slots[]`, `Pack.contents[]`,
  `Purchase.lines[]` and `Visit.lines[]` are arrays of subdocuments; the
  conversion has to walk into them.
- **Reports per collection and field** — counts converted, skipped, already
  done.

#### Rollout

Local dev Mongo first, then staging Atlas.

Converted data and old code are mutually unintelligible: once a value is an
ObjectId, `String`-schema code queries with a string and matches nothing,
silently. **Staging is taken down for the migration** rather than tolerating
that window — stop the Cloud Run service, migrate, deploy the new code, bring it
back. Production holds no data and needs nothing.

### 5. Tests

- **Integration fixtures.** 18 literal ids — 7 in
  `VisitRepositoryImpl.integration.test.ts`, 11 in
  `PurchaseRepositoryImpl.integration.test.ts` — become valid ObjectIds, via a
  label→id helper so call sites stay readable as `productId: oid("coke")`. The
  helper memoizes per label so the same label is the same id within a file.
- **Service unit tests are untouched.** They run against
  `test-support/fakes.ts` in-memory maps and never reach Mongoose casting, so
  readable ids like `"coke"` and `"doritos"` stay exactly as they are.
- **A new integration test that runs an actual `$lookup`** and asserts it joins
  a `Visit` to its `Machine`. This is the only test that can fail if the
  migration is wrong. Everything else passes whether or not the stored type
  actually changed — which is precisely the failure mode this whole document
  exists to fix.
- **A unit test for `toId(null)`** asserting it returns `null` and not
  `"null"`.
- e2e is unaffected; it drives the real API, which mints real ObjectIds.

### 6. Out of scope

- **No `populate()` anywhere.** The service-layer joins
  (`loadMachinesById` / `loadLocationsById` / `loadProductsById`) stay exactly
  as they are. Round-trip reduction was explicitly not a driver, and those
  in-JS joins keep the repository boundary clean.
- **No rewrite of `VisitServiceImpl`.**
- **No change to the `orgId` tenant key or any Clerk-issued id.**
- **No aggregation report is written here.** This change makes them possible;
  building one is separate work.

## The risk this creates

**Aggregation pipelines bypass Mongoose casting.** Enabling pipelines is the
entire point of this change, and in a pipeline `$match: { machineId: someString
}` does not cast and matches nothing — no error, just an empty result.

This is the same family as the post-fill count hazard `Visit.ts` already warns
about: a silent wrong answer, not a crash. The first aggregation we write
carries a comment saying so.

## Verification

The change is done when:

1. `bun run typecheck` and `bun run test` pass.
2. The new `$lookup` integration test joins a visit to its machine.
3. The migration script, re-run against local Mongo, reports zero conversions
   and zero skips.
4. A `mongosh` query on `machines` shows `locationId` with
   `$type: "objectId"` and no remaining string-typed values.
5. Staging serves the dashboard after the migrate-and-deploy.
