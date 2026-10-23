# iOS Mirror Fan-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the iOS app's bundled-fixture seeding with a real refresh over `/api/v1`, structured so a failed network call can never delete anything from the local store.

**Architecture:** `MirrorRefresher` fetches `GET /me` for the org, then the five reference-data endpoints serially. Nothing reaches `MirrorWriter` until all five have returned, because `MirrorWriter.reconcile` deletes rows absent from the payload it is handed — so a partial payload is a deletion, not a smaller refresh. `GET /visits/latest` is applied afterwards on its own boundary, since nothing joins against it. Generated OpenAPI types are confined to one adapter file and mapped to the existing `Remote*` structs, which keeps the test stubs trivial and the fixture usable.

**Tech Stack:** Swift 6 / SwiftUI / SwiftData / XCTest, `swift-openapi-generator` as an Xcode build-tool plugin, ClerkKit for auth tokens. Backend is Bun + zod + `trpc-to-openapi`.

**Design of record:** `docs/superpowers/specs/2026-10-22-ios-mirror-fan-in-design.md`

## Global Constraints

- **Money is `Int` cents everywhere. Never `Double`, never `Decimal`.** This is the reason Task 1 exists.
- **Views never write to the store and never touch the network.** Views read with `@Query` and call service methods; services own every write. (`ios/ARCHITECTURE.md`)
- **Services expose intents and status, never data.** A service that returned rows would be a second cache competing with SwiftData.
- **Never infer layout from codes.** `Machine.slots` is `[[String]]` and renders as authored.
- **Entity models carry no `orgId`, and no query filters by org.** The single `StoreMetadata` row is the only place the org is recorded; `wipeIfOrgChanged` is the only defence against cross-org leakage. Any new org-scoped model MUST be added to that wipe.
- **Pure logic is marked `nonisolated` explicitly.** Project default isolation is `MainActor`; code touching no shared state should have no actor affinity.
- **Swift naming:** `UpperCamelCase` types, `lowerCamelCase` everything else, acronyms uniformly cased by position (`apiBaseURL`, `isRepresentableAsASCII`). Label every argument except where the call reads as grammatical English without one.
- **TypeScript naming:** acronyms are treated as words (`tripApi`, `parseHttpUrl`). `build` constructs, `create` persists.
- **Comments say *why*, not *what*.** Short. Long-form reasoning belongs in the spec, not inline.
- **iOS tests MUST be verified on a physical device.** In the Simulator, tests that construct app-module `@Observable` types or a `ModelContainer` abort the test host with `malloc: pointer being freed was not allocated`; XCTest silently skips them and reports green. Task 2 fixes the runner; every later task's "run the tests" step assumes it.
- **Xcode 26 is required.** `ios/Scripts/xc` pins `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`. Xcode 16.4 fails with a misleading clerk-ios package error.
- **This worktree's API port is 3211**, already set in `ios/Config/Debug.xcconfig`. Other worktrees default to 3210 — check the API's cwd before blaming the data.
- **`mongodb` and `bson` are pinned to 7.2.0** in the root `package.json` `overrides`. bson ≥ 7.3 crashes Bun 1.3.x. Do not bump them.

## Context an implementer will otherwise waste time on

- **`deletedAt` is not on the REST surface.** No DTO in `packages/api/src/schemas/` declares it and it appears zero times in `openapi/vendpire.yaml` or in `ios/Vendpire/Fixtures/sample-org.json`. The `Remote*` structs declare it optional and it decodes to `nil` from both sources. This is pre-existing and **out of scope** — do not add it. When you find no `deletedAt` on `Components.Schemas.Product`, that is expected, not a mistake.
- **`RemoteProduct` has no `tracksExpiration`** even though `productDto` does. The adapter simply does not map it. Also expected.
- **`Machine.kind` and `cardReader.provider` are enums in the DTO** (`snack`/`drink`/`combo`, `nayax`/`cantaloupe`) but plain `String` on the Swift side. The adapter maps `.rawValue`. That looseness is deliberate: an unrecognised value from a newer server must not make a machine vanish.
- **`Location.commission` is the one `oneOf` in the document.** It generates a Swift enum with three cases and has to be flattened into the existing `Commission` struct. Task 9 covers it explicitly.

## File Structure

**Backend — Task 1 only (separate PR):**

| File | Responsibility |
|---|---|
| `packages/api/src/schemas/{product,pack,planogram,location,visit,purchase}.ts` | Modify: `z.number()` → `z.number().int()` on money and count fields |
| `packages/api/src/openapi/buildOpenApiDocument.test.ts` | Modify: assert money fields emit `type: integer` |
| `openapi/vendpire.yaml` | Regenerated artifact |

**iOS:**

| File | Responsibility |
|---|---|
| `ios/Scripts/xc` | Modify: prefer a connected device over the Simulator |
| `ios/Vendpire/Services/MirrorWriter/MirrorWriter.swift` | Modify: rollback on throw; `syncedAt` parameter; `applyLatestVisits`; wipe `StoredLatestVisit` |
| `ios/Vendpire/Remote/RemoteOrg.swift` | Modify: drop `exportedAt`; add `RemoteIdentity`, `RemoteVisit`, `RemoteVisitLine` |
| `ios/Vendpire/Store/Model/StoredEntities.swift` | Modify: add `StoredLatestVisit` |
| `ios/Vendpire/Store/Model/ValueTypes.swift` | Modify: add `VisitLineSnapshot` |
| `ios/Vendpire/Store/VendpireStore.swift` | Modify: register `StoredLatestVisit` |
| `ios/Vendpire/Domain/VisitLevels.swift` | Create: `levelAfter` |
| `ios/Vendpire/Services/MirrorWriter/StoredEntities+Remote.swift` | Modify: `StoredLatestVisit` mapping |
| `ios/Vendpire/Services/VendpireAPI/VendpireAPI.swift` | Modify: seven method signatures |
| `ios/Vendpire/Services/MirrorRefresher/MirrorRefresher.swift` | Create: the fan-in and `MirrorState` |
| `ios/Vendpire/Services/VendpireAPI/VendpireAPIClient.swift` | Create: the only file importing generated code |
| `ios/Vendpire/Services/VendpireAPI/Remote+Generated.swift` | Create: generated → `Remote*` mapping |
| `ios/Vendpire/Services/VendpireAPI/AuthTokenMiddleware.swift` | Create: per-request Clerk token |
| `ios/Vendpire/VendpireApp.swift` | Modify: refresh replaces the fixture seed; foreground trigger |
| `ios/Vendpire/Features/LocationList/LocationListView.swift` | Modify: staleness badge, pull-to-refresh |
| `ios/VendpireTests/MirrorRefresherTests.swift` | Create: the six orchestration cases |
| `ios/VendpireTests/StubVendpireAPI.swift` | Create: configurable stub |
| `ios/VendpireTests/VisitLevelsTests.swift` | Create: `levelAfter` |

---

# Part 1 — Prerequisite PR

This ships on its own branch and merges before any iOS work starts.

### Task 1: Declare money and counts as integers on the read path

**Files:**
- Modify: `packages/api/src/schemas/product.ts:14`
- Modify: `packages/api/src/schemas/pack.ts:16`
- Modify: `packages/api/src/schemas/planogram.ts:15-16`
- Modify: `packages/api/src/schemas/location.ts:15,18`
- Modify: `packages/api/src/schemas/visit.ts:29,37,38,42,47`
- Modify: `packages/api/src/schemas/purchase.ts:13,15,21`
- Modify: `packages/api/src/openapi/buildOpenApiDocument.test.ts`
- Regenerate: `openapi/vendpire.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: an `openapi/vendpire.yaml` in which `Product.defaultPriceCents`, `Planogram.slots.items.par`, `Planogram.slots.items.priceCents`, `LocationCommission` `percentBps`/`flatCents`, `Pack.contents.items.units`, `Visit.lines.items.{remaining,added,removed,priceCents,par}`, `Purchase.lines.items.{units,totalCostCents}` and `Purchase.receiptTotalCents` all carry `type: integer`. Task 9's adapter depends on these generating as Swift `Int`.

**Background:** The nine `type: integer` entries in the current document are all POST request bodies. Every response field is `type: number`, which `swift-openapi-generator` maps to `Double`. The `Exactly<>` guard in `packages/api/src/schemas/exactly.ts` cannot catch this — TypeScript has no integer type, so `z.number()` and `z.number().int()` both infer `number`. For the same reason, adding `.int()` cannot break it.

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/openapi/buildOpenApiDocument.test.ts`, inside the existing `describe("the shapes a Swift client has to decode", …)` block:

```ts
  it("declares money and counts as integers, so Swift gets Int and not Double", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));
    const schemas = document.components.schemas;

    const moneyAndCounts = [
      schemas.Product.properties.defaultPriceCents,
      schemas.Planogram.properties.slots.items.properties.par,
      schemas.Planogram.properties.slots.items.properties.priceCents,
      schemas.Pack.properties.contents.items.properties.units,
      schemas.Visit.properties.lines.items.properties.remaining,
      schemas.Visit.properties.lines.items.properties.added,
      schemas.Visit.properties.lines.items.properties.removed,
      schemas.Visit.properties.lines.items.properties.priceCents,
      schemas.Purchase.properties.lines.items.properties.units,
      schemas.Purchase.properties.lines.items.properties.totalCostCents,
    ];

    for (const property of moneyAndCounts) {
      expect(property.type).toBe("integer");
    }

    // The nullable ones spell the type as an array; "number" must not appear.
    expect(schemas.Visit.properties.lines.items.properties.par.type).toEqual([
      "integer",
      "null",
    ]);
    expect(schemas.Purchase.properties.receiptTotalCents.type).toEqual([
      "integer",
      "null",
    ]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd packages/api test buildOpenApiDocument`

Expected: FAIL — `expect(received).toBe(expected)` with `received: "number"`.

- [ ] **Step 3: Change the six schema files**

In `packages/api/src/schemas/product.ts`, line 14:

```ts
    defaultPriceCents: z.number().int(),
```

In `packages/api/src/schemas/pack.ts`, the `contents` array:

```ts
    contents: z.array(
      z.object({ productId: z.string(), units: z.number().int() }),
    ),
```

In `packages/api/src/schemas/planogram.ts`, the `slots` array:

```ts
    slots: z.array(
      z.object({
        slotCode: z.string(),
        productId: z.string(),
        /** Units the slot holds when full — the refill target. */
        par: z.number().int().describe("Units the slot holds when full — the refill target."),
        priceCents: z.number().int(),
      }),
    ),
```

In `packages/api/src/schemas/location.ts`, the commission union:

```ts
    z.object({
      type: z.literal("percent"),
      percentBps: z.number().int(),
      basis: z.enum(["gross", "net"]),
    }),
    z.object({ type: z.literal("flat"), flatCents: z.number().int() }),
```

In `packages/api/src/schemas/visit.ts`, the `lines` array — five fields:

```ts
        remaining: z
          .number()
          .int()
          .describe(
            "What was physically in the slot on arrival, before refilling and before removing anything — every derived number is silently wrong if a post-fill count is recorded here.",
          ),
        added: z.number().int(),
        removed: z.number().int(),
```

and:

```ts
        priceCents: z
          .number()
          .int()
          .describe(
            "Snapshotted, so a later planogram edit cannot rewrite past revenue.",
          ),
        par: z
          .number()
          .int()
          .nullable()
          .describe("Fill target in effect at this servicing; never used in the P&L."),
```

In `packages/api/src/schemas/purchase.ts`, the `lines` array and the receipt total:

```ts
        units: z.number().int(),
        /** The TOTAL for the line, not a unit cost — the receipt's number. */
        totalCostCents: z
          .number()
          .int()
          .describe("The TOTAL for the line, not a unit cost — the receipt's number."),
```

and line 21:

```ts
    receiptTotalCents: z.number().int().nullable(),
```

- [ ] **Step 4: Regenerate the committed document**

Run: `bun run --cwd packages/api openapi`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run --cwd packages/api test`

Expected: PASS, including the pre-existing `"matches a fresh generation, so a schema change cannot ship un-regenerated"` case. If that one fails, Step 4 was skipped.

- [ ] **Step 6: Typecheck, to confirm `Exactly<>` is unaffected**

Run: `bun run typecheck`

Expected: clean. If it fails, an entity type genuinely disagrees — stop and report rather than loosening the assertion.

- [ ] **Step 7: Run the e2e suite**

Run: `bun run test:e2e`

Expected: 32 passed. The REST surface spec parses the YAML, so a malformed regeneration surfaces here.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/schemas packages/api/src/openapi/buildOpenApiDocument.test.ts openapi/vendpire.yaml
git commit -m "fix(api): declare money and counts as integers on the read path

Every response field was z.number(), which swift-openapi-generator maps to
Double — a truncation site on money in a codebase whose rule is Int cents
everywhere. The Exactly<> guard cannot catch it: TypeScript has no integer
type, so both spellings infer number."
```

---

# Part 2 — Phase 7

Branch from `main` after Part 1 merges.

### Task 2: Make `ios:test` prefer a connected device

**Files:**
- Modify: `ios/Scripts/xc`

**Interfaces:**
- Consumes: nothing.
- Produces: `bun run ios:test` running on an attached device when one is present. Every later task's test step depends on this.

**Background:** `resolveSim` currently always returns a Simulator UDID. In the Simulator, 9 existing tests abort the test host before asserting; XCTest restarts, silently skips them, and reports green. A run showing "Executed 16 tests" is actually 33 short. Confirmed a Simulator defect — all 49 tests pass on an iPhone 16 Pro, iOS 26.7.1 — and reproduced identically on iOS 18.6 and 26.1 runtimes. Do not re-investigate; the disproved hypotheses are listed on the "ios:test runs on the Simulator" shuffleboard card.

- [ ] **Step 1: Add device resolution**

In `ios/Scripts/xc`, add above `resolveSim`:

```bash
# Prefer a physically attached device. Nine tests abort the test host in the
# Simulator and XCTest silently skips them, so a green Simulator run is not
# evidence. VENDPIRE_SIM forces the Simulator back.
resolveDevice() {
  xcrun xctrace list devices 2>/dev/null | python3 -c '
import re, sys
section = False
for line in sys.stdin:
    if line.startswith("== Devices =="):
        section = True
        continue
    if line.startswith("== "):
        section = False
    if not section:
        continue
    # "Jeremy'"'"'s iPhone (26.7.1) (00008130-…)" — the version group is what
    # separates a real device from the "My Mac" entry, which has no version.
    match = re.match(r"^.* \(\d+(?:\.\d+)+\) \(([0-9A-Fa-f-]+)\)\s*$", line)
    if match:
        print(match.group(1))
        break
'
}
```

python3 rather than awk deliberately: macOS ships BSD awk, whose `match()` takes no capture-array argument, so the GNU spelling fails silently and returns nothing. `resolveSim` already uses python3 for the same reason.

- [ ] **Step 2: Use it in `runTests`**

Replace the first line of `runTests`:

```bash
runTests() {
  local udid platform
  if [[ -z "${VENDPIRE_SIM:-}" ]] && udid="$(resolveDevice)" && [[ -n "$udid" ]]; then
    platform="iOS"
    echo "Testing on attached device $udid" >&2
  else
    udid="$(resolveSim)"
    platform="iOS Simulator"
    echo "Testing on Simulator $udid — 9 tests will be silently skipped" >&2
  fi
  xcodebuild -project "$IOS_DIR/$SCHEME.xcodeproj" -scheme "$SCHEME" \
    -destination "platform=$platform,id=$udid" \
    -derivedDataPath "$DERIVED" \
    -skip-testing:VendpireUITests \
    -parallel-testing-enabled NO \
    test "$@"
}
```

`-parallel-testing-enabled NO` is added because parallel clones report a misleading "Invalid device state (Mach error -308)" that hides the real failure.

- [ ] **Step 3: Verify on a device**

Attach and unlock an iPhone. Run: `bun run ios:test`

Expected: the "Testing on attached device" line, then **49 tests executed, 49 passed**. If the count is 40 or 16, the device was not picked up.

- [ ] **Step 4: Verify the Simulator fallback still works**

Run: `VENDPIRE_SIM="iPhone 17 Pro" bun run ios:test`

Expected: the warning line, and a run that completes (with the known skips).

- [ ] **Step 5: Commit**

```bash
git add ios/Scripts/xc
git commit -m "fix(ios): run tests on an attached device when one is present

The Simulator aborts nine tests before they assert and XCTest reports green
anyway, so a Simulator run is not evidence. VENDPIRE_SIM forces it back."
```

### Task 3: Give `MirrorWriter` a rollback and an explicit `syncedAt`

**Files:**
- Modify: `ios/Vendpire/Services/MirrorWriter/MirrorWriter.swift:27,56`
- Modify: `ios/Vendpire/Remote/RemoteOrg.swift:11`
- Modify: `ios/Vendpire/Services/DevFixtureLoader/DevFixtureLoader.swift`
- Modify: `ios/VendpireTests/MirrorWriterTests.swift`

**Interfaces:**
- Consumes: nothing.
- Produces: `func apply(_ remote: RemoteOrg, syncedAt: Date) throws` on `MirrorWriter`. `RemoteOrg` no longer has an `exportedAt` property. Tasks 5, 8 and 10 call this signature.

**Background:** `apply` stages inserts and deletes on the `ModelContext` and saves at the end. If `reconcile` throws from `context.fetch` partway through, those staged changes are not discarded — they are flushed by the next `save()` from anywhere in the app, writing a half-applied mirror at an unrelated moment. Unreachable while `DevFixtureLoader` is the only writer; reachable the moment refreshes repeat against a network.

Separately, `apply` reads the sync timestamp out of the payload. That is right for a fixture genuinely exported at a known time and wrong for a payload the device just assembled. Keeping both a payload field and a parameter would make `MirrorRefresher` pass the same clock reading twice.

- [ ] **Step 1: Write the failing tests**

Add to `ios/VendpireTests/MirrorWriterTests.swift`:

```swift
    // MARK: - The transaction boundary

    func testStampsTheSyncedAtItWasGivenRatherThanAnythingInThePayload() throws {
        try setUpStore()
        let syncedAt = Date(timeIntervalSince1970: 1_000_000)

        try writer.apply(makeRemoteOrg(orgId: "org-a"), syncedAt: syncedAt)

        let metadata = try fetch(StoreMetadata.self)
        XCTAssertEqual(metadata.first?.lastSyncedAt, syncedAt)
    }

    /// A throw mid-apply must leave nothing staged, or the next unrelated save
    /// anywhere in the app flushes a half-applied mirror.
    func testAThrowPartWayThroughLeavesNothingStaged() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(), syncedAt: Date())
        let before = try count(StoredProduct.self)

        context.insert(StoredProduct(makeProduct(name: "Staged By A Failed Apply")))
        writer.discardPendingChanges()

        XCTAssertEqual(try count(StoredProduct.self), before)
    }
```

- [ ] **Step 2: Update the existing test helper and call sites**

In `makeRemoteOrg`, delete the `exportedAt` parameter and the `exportedAt:` argument to `RemoteOrg(...)`. Then update every existing `try writer.apply(...)` call in the file to pass `syncedAt:`, for example:

```swift
        try writer.apply(makeRemoteOrg(), syncedAt: Date(timeIntervalSince1970: 0))
```

Delete the old `testStampsMetadata`-style assertion at lines 100-106 that compared `lastSyncedAt` to the payload's `exportedAt` — the new test above replaces it.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run ios:test`

Expected: compile failure — `extra argument 'syncedAt' in call` and `value of type 'MirrorWriter' has no member 'discardPendingChanges'`.

- [ ] **Step 4: Change `RemoteOrg`**

In `ios/Vendpire/Remote/RemoteOrg.swift`, delete the `exportedAt` line from the struct:

```swift
nonisolated struct RemoteOrg: Decodable, Sendable {
    let orgId: String
    let locations: [RemoteLocation]
    let machines: [RemoteMachine]
    let products: [RemoteProduct]
    let packs: [RemotePack]
    let planograms: [RemotePlanogram]
}
```

`Decodable` ignores unknown keys, so the fixture's `exportedAt` is harmlessly skipped and `packages/api/scripts/exportIosFixture.ts` needs no change.

- [ ] **Step 5: Change `MirrorWriter`**

Replace the `apply` method's signature and body in `ios/Vendpire/Services/MirrorWriter/MirrorWriter.swift`:

```swift
    /// `syncedAt` is passed rather than read off the payload: the fixture was
    /// exported at a known time, a live refresh was assembled just now, and the
    /// writer should not have to know which it is holding.
    func apply(_ remote: RemoteOrg, syncedAt: Date) throws {
        do {
            try wipeIfOrgChanged(to: remote.orgId)

            try reconcile(
                remote.locations,
                idOfRemote: \.id,
                idOfStored: \StoredLocation.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredLocation($0) }
            )
            try reconcile(
                remote.machines,
                idOfRemote: \.id,
                idOfStored: \StoredMachine.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredMachine($0) }
            )
            try reconcile(
                remote.products,
                idOfRemote: \.id,
                idOfStored: \StoredProduct.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredProduct($0) }
            )
            try reconcile(
                remote.packs,
                idOfRemote: \.id,
                idOfStored: \StoredPack.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredPack($0) }
            )
            try reconcile(
                remote.planograms,
                idOfRemote: \.id,
                idOfStored: \StoredPlanogram.id,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredPlanogram($0) }
            )

            try stamp(orgId: remote.orgId, at: syncedAt)
            try context.save()
        } catch {
            discardPendingChanges()
            throw error
        }
    }

    /// Staged inserts and deletes do not evaporate on a throw — the next save
    /// anywhere in the app would flush them.
    func discardPendingChanges() {
        context.rollback()
    }
```

- [ ] **Step 6: Update `DevFixtureLoader`**

In `ios/Vendpire/Services/DevFixtureLoader/DevFixtureLoader.swift`, change `load()`:

```swift
    func load() throws {
        let remote = try readRemoteOrg()
        // The seed really did just happen; the fixture's own export time is
        // not when this device synced.
        try writer.apply(remote, syncedAt: Date())
    }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run ios:test`

Expected: all tests pass on the attached device.

- [ ] **Step 8: Commit**

```bash
git add ios/Vendpire/Services/MirrorWriter ios/Vendpire/Remote ios/Vendpire/Services/DevFixtureLoader ios/VendpireTests/MirrorWriterTests.swift
git commit -m "fix(ios): roll back a failed apply and take syncedAt explicitly

A throw mid-reconcile left inserts and deletes staged on the context, to be
flushed by the next unrelated save. Harmless while one fixture load was the
only writer; not once refreshes repeat against a network."
```

### Task 4: Add `StoredLatestVisit` and `levelAfter`

**Files:**
- Modify: `ios/Vendpire/Store/Model/ValueTypes.swift`
- Modify: `ios/Vendpire/Store/Model/StoredEntities.swift`
- Modify: `ios/Vendpire/Store/VendpireStore.swift:7-14`
- Create: `ios/Vendpire/Domain/VisitLevels.swift`
- Create: `ios/VendpireTests/VisitLevelsTests.swift`

**Interfaces:**
- Consumes: nothing.
- Produces: `StoredLatestVisit` (`@Model`, properties `id: String`, `machineId: String`, `countedAt: Date`, `lines: [VisitLineSnapshot]`), `VisitLineSnapshot` (`slotCode: String`, `productId: String`, `remaining: Int`, `added: Int`, `removed: Int`), and `VisitLineSnapshot.levelAfter: Int`. Tasks 5, 6 and 8 use these.

- [ ] **Step 1: Write the failing test**

Create `ios/VendpireTests/VisitLevelsTests.swift`:

```swift
import XCTest

@testable import Vendpire

/// Mirrors packages/domain/src/visits/sold.ts. Same arithmetic, same name — the
/// two drift the moment either side gets clever.
final class VisitLevelsTests: XCTestCase {
    func testLevelAfterIsWhatWasLeftInTheSlot() {
        let line = VisitLineSnapshot(
            slotCode: "A0",
            productId: "product-1",
            remaining: 2,
            added: 8,
            removed: 1
        )

        XCTAssertEqual(line.levelAfter, 9)
    }

    func testAnUntouchedSlotKeepsItsRemainingCount() {
        let line = VisitLineSnapshot(
            slotCode: "B2",
            productId: "product-2",
            remaining: 5,
            added: 0,
            removed: 0
        )

        XCTAssertEqual(line.levelAfter, 5)
    }

    func testEverythingRemovedLeavesNothing() {
        let line = VisitLineSnapshot(
            slotCode: "C4",
            productId: "product-3",
            remaining: 3,
            added: 0,
            removed: 3
        )

        XCTAssertEqual(line.levelAfter, 0)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run ios:test`

Expected: compile failure — `cannot find 'VisitLineSnapshot' in scope`.

- [ ] **Step 3: Add the value type**

Append to `ios/Vendpire/Store/Model/ValueTypes.swift`:

```swift
// MARK: - Visit

/// One slot's line from the machine's most recent visit. Counts are `Int` — the
/// money rule applies to units too.
///
/// Carries only what "what did I leave here last time" needs. Price and par for
/// a new visit come from the current planogram, not from the prior visit.
nonisolated struct VisitLineSnapshot: Codable, Equatable, Hashable, Sendable {
    var slotCode: String
    var productId: String
    /// What was in the slot on arrival, BEFORE refilling and removing.
    var remaining: Int
    var added: Int
    var removed: Int
}
```

- [ ] **Step 4: Add the model**

Append to `ios/Vendpire/Store/Model/StoredEntities.swift`:

```swift
/// The machine's most recent visit, mirrored so capture can show what was left
/// behind last time.
///
/// Keyed by `machineId`, not the visit id: the endpoint's contract is one visit
/// per machine, so a newer visit is an update rather than a delete-plus-insert.
@Model
final class StoredLatestVisit {
    #Unique<StoredLatestVisit>([\.machineId])

    var id: String = ""
    var machineId: String = ""
    var countedAt: Date = Date.distantPast
    var lines: [VisitLineSnapshot] = []

    init(id: String, machineId: String, countedAt: Date, lines: [VisitLineSnapshot]) {
        self.id = id
        self.machineId = machineId
        self.countedAt = countedAt
        self.lines = lines
    }
}
```

- [ ] **Step 5: Register it in the schema**

In `ios/Vendpire/Store/VendpireStore.swift`, add to the `Schema` array:

```swift
    static let schema = Schema([
        StoredLocation.self,
        StoredMachine.self,
        StoredProduct.self,
        StoredPack.self,
        StoredPlanogram.self,
        StoredLatestVisit.self,
        StoreMetadata.self,
    ])
```

- [ ] **Step 6: Add `levelAfter`**

Create `ios/Vendpire/Domain/VisitLevels.swift`:

```swift
import Foundation

/// Pure arithmetic over visit lines. No SwiftData, no simulator, no fixture —
/// which is the whole reason `Domain/` exists. See ARCHITECTURE.md.

extension VisitLineSnapshot {
    /// What was left in the slot when the operator walked away.
    ///
    /// Named to match `levelAfter` in packages/domain/src/visits/sold.ts, which
    /// is the same arithmetic the server's P&L runs on.
    var levelAfter: Int { remaining + added - removed }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run ios:test`

Expected: all tests pass, including the three new ones.

- [ ] **Step 8: Commit**

```bash
git add ios/Vendpire/Store ios/Vendpire/Domain/VisitLevels.swift ios/VendpireTests/VisitLevelsTests.swift
git commit -m "feat(ios): mirror each machine's latest visit

Keyed on machineId, since the endpoint's contract is one per machine. The
prior count is computed rather than stored, matching the server rule that
nothing derived is persisted."
```

### Task 5: Teach `MirrorWriter` to apply latest visits

**Files:**
- Modify: `ios/Vendpire/Remote/RemoteOrg.swift`
- Modify: `ios/Vendpire/Services/MirrorWriter/StoredEntities+Remote.swift`
- Modify: `ios/Vendpire/Services/MirrorWriter/MirrorWriter.swift`
- Modify: `ios/VendpireTests/MirrorWriterTests.swift`

**Interfaces:**
- Consumes: `StoredLatestVisit`, `VisitLineSnapshot` (Task 4); `MirrorWriter.apply(_:syncedAt:)` (Task 3).
- Produces: `RemoteVisit` (`id`, `machineId`, `countedAt: Date`, `lines: [RemoteVisitLine]`), `RemoteVisitLine` (`slotCode`, `productId`, `remaining: Int`, `added: Int`, `removed: Int`), and `func applyLatestVisits(_ visits: [RemoteVisit]) throws` on `MirrorWriter`. Tasks 6, 7 and 9 use these.

**Background:** `StoredLatestVisit` is org-scoped and carries no `orgId`, so it MUST be added to `wipeIfOrgChanged`. Missing that is the cross-org leak the whole no-`orgId` design exists to prevent.

- [ ] **Step 1: Write the failing tests**

Add to `ios/VendpireTests/MirrorWriterTests.swift`:

```swift
    // MARK: - Latest visits

    func testAppliesLatestVisitsKeyedByMachine() throws {
        try setUpStore()

        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-1", machineId: "machine-1")])

        let stored = try fetch(StoredLatestVisit.self)
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored.first?.machineId, "machine-1")
        XCTAssertEqual(stored.first?.lines.first?.levelAfter, 9)
    }

    func testANewerVisitReplacesTheMachinesPreviousOne() throws {
        try setUpStore()
        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-1", machineId: "machine-1")])

        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-2", machineId: "machine-1")])

        let stored = try fetch(StoredLatestVisit.self)
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored.first?.id, "visit-2")
    }

    func testDropsAVisitTheServerNoLongerCarries() throws {
        try setUpStore()
        try writer.applyLatestVisits([
            makeRemoteVisit(id: "visit-1", machineId: "machine-1"),
            makeRemoteVisit(id: "visit-2", machineId: "machine-2"),
        ])

        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-1", machineId: "machine-1")])

        XCTAssertEqual(try count(StoredLatestVisit.self), 1)
    }

    /// StoredLatestVisit carries no orgId, so the wipe is the only thing between
    /// it and a cross-org leak.
    func testAnOrgChangeWipesLatestVisitsToo() throws {
        try setUpStore()
        try writer.apply(makeRemoteOrg(orgId: "org-a"), syncedAt: Date())
        try writer.applyLatestVisits([makeRemoteVisit(id: "visit-1", machineId: "machine-1")])

        try writer.apply(makeRemoteOrg(orgId: "org-b"), syncedAt: Date())

        XCTAssertEqual(try count(StoredLatestVisit.self), 0)
    }
```

And the helper, alongside the other `make*` helpers:

```swift
    private func makeRemoteVisit(id: String, machineId: String) -> RemoteVisit {
        RemoteVisit(
            id: id,
            machineId: machineId,
            countedAt: Date(timeIntervalSince1970: 0),
            lines: [
                RemoteVisitLine(
                    slotCode: "A0",
                    productId: "product-1",
                    remaining: 2,
                    added: 8,
                    removed: 1
                )
            ]
        )
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run ios:test`

Expected: compile failure — `cannot find 'RemoteVisit' in scope`.

- [ ] **Step 3: Add the remote types**

Append to `ios/Vendpire/Remote/RemoteOrg.swift`:

```swift
/// A machine's most recent visit. Only the fields the phone reads — the server
/// sends more, and `Decodable` ignores the rest.
nonisolated struct RemoteVisit: Decodable, Sendable {
    let id: String
    let machineId: String
    let countedAt: Date
    let lines: [RemoteVisitLine]
}

nonisolated struct RemoteVisitLine: Decodable, Sendable {
    let slotCode: String
    let productId: String
    let remaining: Int
    let added: Int
    let removed: Int
}
```

- [ ] **Step 4: Add the mapping**

Append to `ios/Vendpire/Services/MirrorWriter/StoredEntities+Remote.swift`:

```swift
extension StoredLatestVisit {
    convenience init(_ remote: RemoteVisit) {
        self.init(
            id: remote.id,
            machineId: remote.machineId,
            countedAt: remote.countedAt,
            lines: remote.lines.map(VisitLineSnapshot.init)
        )
    }

    func update(from remote: RemoteVisit) {
        id = remote.id
        countedAt = remote.countedAt
        lines = remote.lines.map(VisitLineSnapshot.init)
    }
}

extension VisitLineSnapshot {
    init(_ remote: RemoteVisitLine) {
        self.init(
            slotCode: remote.slotCode,
            productId: remote.productId,
            remaining: remote.remaining,
            added: remote.added,
            removed: remote.removed
        )
    }
}
```

- [ ] **Step 5: Add `applyLatestVisits` and extend the wipe**

In `ios/Vendpire/Services/MirrorWriter/MirrorWriter.swift`, add after `apply`:

```swift
    /// Applied on its own boundary, after the reference data. Nothing joins
    /// against latest visits, so losing a refresh of them tears nothing.
    func applyLatestVisits(_ visits: [RemoteVisit]) throws {
        do {
            try reconcile(
                visits,
                idOfRemote: \.machineId,
                idOfStored: \StoredLatestVisit.machineId,
                update: { stored, remote in stored.update(from: remote) },
                insert: { StoredLatestVisit($0) }
            )
            try context.save()
        } catch {
            discardPendingChanges()
            throw error
        }
    }
```

And add the model to the delete list in `wipeIfOrgChanged`:

```swift
        try context.delete(model: StoredPlanogram.self)
        try context.delete(model: StoredLatestVisit.self)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run ios:test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add ios/Vendpire/Remote ios/Vendpire/Services/MirrorWriter ios/VendpireTests/MirrorWriterTests.swift
git commit -m "feat(ios): apply latest visits on their own boundary

Reconciled by machineId and wiped on an org change — it carries no orgId, so
the wipe is the only thing between it and a cross-org leak."
```

### Task 6: Define the `VendpireAPI` surface

**Files:**
- Modify: `ios/Vendpire/Services/VendpireAPI/VendpireAPI.swift`
- Modify: `ios/Vendpire/Remote/RemoteOrg.swift`

**Interfaces:**
- Consumes: `RemoteVisit` (Task 5).
- Produces: the seven-method `VendpireAPI` protocol and `RemoteIdentity` (`userId: String`, `orgId: String?`). Tasks 7, 9 and 10 depend on these exact signatures.

- [ ] **Step 1: Add `RemoteIdentity`**

Append to `ios/Vendpire/Remote/RemoteOrg.swift`:

```swift
/// The signed-in principal, as the server sees it.
///
/// A null `orgId` is a real state, not an error: it is how a member-less user
/// learns why nothing syncs.
nonisolated struct RemoteIdentity: Decodable, Sendable {
    let userId: String
    let orgId: String?
}
```

- [ ] **Step 2: Replace the protocol**

Rewrite `ios/Vendpire/Services/VendpireAPI/VendpireAPI.swift`:

```swift
import Foundation

/// The single seam between the app and the network.
///
/// Vends `Remote*` rather than the generated OpenAPI types so a stub stays two
/// lines and the bundled fixture remains usable as test input. The generated
/// types live behind `VendpireAPIClient` and nowhere else. See ARCHITECTURE.md.
protocol VendpireAPI: Sendable {
    func fetchIdentity() async throws -> RemoteIdentity
    func fetchLocations() async throws -> [RemoteLocation]
    func fetchMachines() async throws -> [RemoteMachine]
    func fetchProducts() async throws -> [RemoteProduct]
    func fetchPacks() async throws -> [RemotePack]
    func fetchCurrentPlanograms() async throws -> [RemotePlanogram]
    func fetchLatestVisits() async throws -> [RemoteVisit]
}
```

- [ ] **Step 3: Verify it builds**

Run: `bun run ios:build`

Expected: BUILD SUCCEEDED. Nothing conforms to the protocol yet, which is fine.

- [ ] **Step 4: Commit**

```bash
git add ios/Vendpire/Services/VendpireAPI ios/Vendpire/Remote
git commit -m "feat(ios): give VendpireAPI its seven read methods"
```

### Task 7: Build `MirrorRefresher` against a stub

**Files:**
- Create: `ios/Vendpire/Services/MirrorRefresher/MirrorRefresher.swift`
- Create: `ios/VendpireTests/StubVendpireAPI.swift`
- Create: `ios/VendpireTests/MirrorRefresherTests.swift`

**Interfaces:**
- Consumes: `VendpireAPI`, `RemoteIdentity` (Task 6); `MirrorWriter.apply(_:syncedAt:)` and `applyLatestVisits(_:)` (Tasks 3, 5).
- Produces: `MirrorRefresher` (`init(api:writer:)`, `private(set) var state: MirrorState`, `func refresh() async`) and `MirrorState` (`.idle`, `.refreshing`, `.failed(message: String)`, `.synced(at: Date)`). Tasks 10 and 11 use these.

**Background:** This is the task the whole plan exists for. `MirrorWriter.reconcile` deletes rows absent from the array it is handed, so handing it a partial list is a deletion. The structure below makes that unreachable: no array is passed to the writer until all five have returned.

- [ ] **Step 1: Write the stub**

Create `ios/VendpireTests/StubVendpireAPI.swift`:

```swift
import Foundation

@testable import Vendpire

/// Configurable stand-in for the network. Each closure defaults to returning
/// empty, and a test overrides only what it cares about — including throwing,
/// which is how the "a failed fetch must not delete anything" cases are built.
final class StubVendpireAPI: VendpireAPI, @unchecked Sendable {
    var identity: @Sendable () async throws -> RemoteIdentity = {
        RemoteIdentity(userId: "user-1", orgId: "org-a")
    }
    var locations: @Sendable () async throws -> [RemoteLocation] = { [] }
    var machines: @Sendable () async throws -> [RemoteMachine] = { [] }
    var products: @Sendable () async throws -> [RemoteProduct] = { [] }
    var packs: @Sendable () async throws -> [RemotePack] = { [] }
    var planograms: @Sendable () async throws -> [RemotePlanogram] = { [] }
    var latestVisits: @Sendable () async throws -> [RemoteVisit] = { [] }

    private(set) var callCount = 0

    func fetchIdentity() async throws -> RemoteIdentity {
        callCount += 1
        return try await identity()
    }

    func fetchLocations() async throws -> [RemoteLocation] {
        callCount += 1
        return try await locations()
    }

    func fetchMachines() async throws -> [RemoteMachine] {
        callCount += 1
        return try await machines()
    }

    func fetchProducts() async throws -> [RemoteProduct] {
        callCount += 1
        return try await products()
    }

    func fetchPacks() async throws -> [RemotePack] {
        callCount += 1
        return try await packs()
    }

    func fetchCurrentPlanograms() async throws -> [RemotePlanogram] {
        callCount += 1
        return try await planograms()
    }

    func fetchLatestVisits() async throws -> [RemoteVisit] {
        callCount += 1
        return try await latestVisits()
    }
}

enum StubError: Error { case unreachable }
```

- [ ] **Step 2: Write the failing tests**

Create `ios/VendpireTests/MirrorRefresherTests.swift`:

```swift
import SwiftData
import XCTest

@testable import Vendpire

/// Real SwiftData, stubbed network. These are the cases that lose field data:
/// a refresh deleting the catalog because one call failed, and an org change
/// leaving rows behind.
@MainActor
final class MirrorRefresherTests: XCTestCase {
    private var container: ModelContainer!
    private var context: ModelContext!
    private var writer: MirrorWriter!
    private var api: StubVendpireAPI!

    private func setUpStore() throws {
        container = try VendpireStore.makeInMemoryContainer()
        context = ModelContext(container)
        writer = MirrorWriter(context: context)
        api = StubVendpireAPI()
        api.locations = { [Self.location] }
        api.products = { [Self.product] }
    }

    private func makeRefresher() -> MirrorRefresher {
        MirrorRefresher(api: api, writer: writer)
    }

    func testASuccessfulRefreshFillsTheStoreAndStamps() async throws {
        try setUpStore()
        let refresher = makeRefresher()

        await refresher.refresh()

        XCTAssertEqual(try count(StoredLocation.self), 1)
        XCTAssertEqual(try count(StoredProduct.self), 1)
        guard case .synced = refresher.state else {
            return XCTFail("expected .synced, got \(refresher.state)")
        }
        XCTAssertEqual(try fetch(StoreMetadata.self).first?.orgId, "org-a")
    }

    /// The one this whole design exists for: remove-missing means a payload
    /// without products deletes every product.
    func testAFailedProductsFetchLeavesTheStoreCompletelyUnchanged() async throws {
        try setUpStore()
        await makeRefresher().refresh()
        let productsBefore = try count(StoredProduct.self)
        let locationsBefore = try count(StoredLocation.self)

        api.products = { throw StubError.unreachable }
        let refresher = makeRefresher()
        await refresher.refresh()

        XCTAssertEqual(try count(StoredProduct.self), productsBefore)
        XCTAssertEqual(try count(StoredLocation.self), locationsBefore)
        guard case .failed = refresher.state else {
            return XCTFail("expected .failed, got \(refresher.state)")
        }
    }

    /// Latest visits are a leaf — failing there leaves the refresh successful.
    func testAFailedLatestVisitsFetchStillCountsAsASyncedRefresh() async throws {
        try setUpStore()
        api.latestVisits = { throw StubError.unreachable }
        let refresher = makeRefresher()

        await refresher.refresh()

        XCTAssertEqual(try count(StoredLocation.self), 1)
        guard case .synced = refresher.state else {
            return XCTFail("expected .synced, got \(refresher.state)")
        }
    }

    func testADifferentOrgWipesTheStoreBeforeRefilling() async throws {
        try setUpStore()
        await makeRefresher().refresh()
        try writer.applyLatestVisits([Self.visit])
        XCTAssertEqual(try count(StoredLatestVisit.self), 1)

        api.identity = { RemoteIdentity(userId: "user-1", orgId: "org-b") }
        await makeRefresher().refresh()

        XCTAssertEqual(try fetch(StoreMetadata.self).first?.orgId, "org-b")
        XCTAssertEqual(try count(StoredLatestVisit.self), 0)
    }

    func testAMemberLessUserMakesNoFurtherCallsAndWritesNothing() async throws {
        try setUpStore()
        api.identity = { RemoteIdentity(userId: "user-1", orgId: nil) }
        let refresher = makeRefresher()

        await refresher.refresh()

        XCTAssertEqual(api.callCount, 1)
        XCTAssertEqual(try count(StoredLocation.self), 0)
        XCTAssertEqual(try fetch(StoreMetadata.self).count, 0)
        guard case .failed(let message) = refresher.state else {
            return XCTFail("expected .failed, got \(refresher.state)")
        }
        XCTAssertTrue(message.contains("organization"))
    }

    func testRefreshingTwiceConverges() async throws {
        try setUpStore()

        await makeRefresher().refresh()
        await makeRefresher().refresh()

        XCTAssertEqual(try count(StoredLocation.self), 1)
        XCTAssertEqual(try count(StoredProduct.self), 1)
    }

    // MARK: - Helpers

    private func fetch<Model: PersistentModel>(_ type: Model.Type) throws -> [Model] {
        try context.fetch(FetchDescriptor<Model>())
    }

    private func count<Model: PersistentModel>(_ type: Model.Type) throws -> Int {
        try fetch(type).count
    }

    private static let location = RemoteLocation(
        id: "location-1",
        name: "Right-On Studios",
        address: nil,
        contact: nil,
        commission: nil,
        notes: nil,
        active: true,
        deletedAt: nil,
        updatedAt: nil
    )

    private static let product = RemoteProduct(
        id: "product-1",
        name: "Cinnamon Roll",
        upc: nil,
        category: "pastry",
        taxClass: nil,
        imageUrl: nil,
        defaultPriceCents: 175,
        active: true,
        deletedAt: nil,
        updatedAt: nil
    )

    private static let visit = RemoteVisit(
        id: "visit-1",
        machineId: "machine-1",
        countedAt: Date(timeIntervalSince1970: 0),
        lines: []
    )
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run ios:test`

Expected: compile failure — `cannot find 'MirrorRefresher' in scope`.

- [ ] **Step 4: Write `MirrorRefresher`**

Create `ios/Vendpire/Services/MirrorRefresher/MirrorRefresher.swift`:

```swift
import Foundation

/// What the last refresh did. Status, never rows — rows come from `@Query`.
nonisolated enum MirrorState: Equatable, Sendable {
    case idle
    case refreshing
    case failed(message: String)
    case synced(at: Date)
}

/// Fills the mirror from `/api/v1`.
///
/// The ordering is load-bearing. `MirrorWriter.reconcile` deletes rows absent
/// from the array it is handed, so a payload missing an entity is a deletion
/// rather than a smaller refresh. Every reference fetch therefore has to return
/// before any of them reaches the writer — which makes "a failed refresh never
/// clears the store" a property of the shape rather than of remembering to
/// check.
@MainActor
@Observable
final class MirrorRefresher {
    private(set) var state: MirrorState = .idle

    private let api: any VendpireAPI
    private let writer: MirrorWriter

    init(api: any VendpireAPI, writer: MirrorWriter) {
        self.api = api
        self.writer = writer
    }

    func refresh() async {
        state = .refreshing

        do {
            let identity = try await api.fetchIdentity()
            guard let orgId = identity.orgId else {
                // A real state, not a failure to retry: the token is fine and
                // the six reads below would 403 with no way to say why.
                state = .failed(message: "You're not in an organization.")
                return
            }

            // Serial and early-exit: offline should cost one failed request,
            // not five. The payload is well under 100 KB, so the latency this
            // trades away is invisible on a background refresh.
            let locations = try await api.fetchLocations()
            let machines = try await api.fetchMachines()
            let products = try await api.fetchProducts()
            let packs = try await api.fetchPacks()
            let planograms = try await api.fetchCurrentPlanograms()

            let syncedAt = Date()
            let org = RemoteOrg(
                orgId: orgId,
                locations: locations,
                machines: machines,
                products: products,
                packs: packs,
                planograms: planograms
            )
            try writer.apply(org, syncedAt: syncedAt)
            state = .synced(at: syncedAt)
        } catch {
            state = .failed(message: "Couldn't reach the server.")
            return
        }

        // Applied after the reference data so machineId and productId resolve,
        // and on its own boundary: nothing joins against latest visits, so a
        // failure here tears nothing and must not fail the refresh.
        if let visits = try? await api.fetchLatestVisits() {
            try? writer.applyLatestVisits(visits)
        }
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run ios:test`

Expected: all six `MirrorRefresherTests` cases pass on the attached device.

- [ ] **Step 6: Commit**

```bash
git add ios/Vendpire/Services/MirrorRefresher ios/VendpireTests/StubVendpireAPI.swift ios/VendpireTests/MirrorRefresherTests.swift
git commit -m "feat(ios): fan six reference reads into one mirror apply

No array reaches the writer until all five have returned. reconcile deletes
what a payload omits, so a partial payload is a deletion — this makes that
case unreachable rather than guarded against."
```

### Task 8: Wire up the `swift-openapi-generator` build plugin

**Files:**
- Modify: `ios/Vendpire.xcodeproj/project.pbxproj` (via Xcode, not by hand)
- Create: `ios/Vendpire/Services/VendpireAPI/openapi-generator-config.yaml`
- Create: `ios/Vendpire/Services/VendpireAPI/openapi.yaml` (symlink)

**Interfaces:**
- Consumes: `openapi/vendpire.yaml` as regenerated by Task 1.
- Produces: the `Components.Schemas.*` and `Client` types that Task 9 maps from.

**Background:** The plugin requires the document and its config to sit in the target's source directory under exactly the names `openapi.yaml` and `openapi-generator-config.yaml`. The committed document lives at the repo root, outside `ios/`, so a symlink keeps one source of truth. This task has more Xcode-GUI mechanics than the rest of the plan; budget for iteration and stop at the first verification step that passes rather than polishing.

- [ ] **Step 1: Add the package dependency**

In Xcode: File → Add Package Dependencies → `https://github.com/apple/swift-openapi-generator`, dependency rule "Up to Next Major Version" from whatever 1.x Xcode resolves. Add `https://github.com/apple/swift-openapi-runtime` and `https://github.com/apple/swift-openapi-urlsession` the same way — all three must stay on matching majors. Attach `OpenAPIRuntime` and `OpenAPIURLSession` to the **Vendpire** target; `swift-openapi-generator` itself is a plugin, not a library — do not attach it as a framework.

- [ ] **Step 2: Create the generator config**

Create `ios/Vendpire/Services/VendpireAPI/openapi-generator-config.yaml`:

```yaml
# Types and a client; no server stubs — the phone only calls.
generate:
  - types
  - client
accessModifier: internal
```

- [ ] **Step 3: Symlink the document**

```bash
cd ios/Vendpire/Services/VendpireAPI
ln -s ../../../../openapi/vendpire.yaml openapi.yaml
cd -
```

One source of truth: regenerating the document on the backend updates what the app compiles against.

- [ ] **Step 4: Add both files to the target and enable the plugin**

In Xcode, drag `openapi.yaml` and `openapi-generator-config.yaml` into the `VendpireAPI` group with "Add to target: Vendpire" checked. Then target **Vendpire** → Build Phases → Run Build Tool Plug-ins → `+` → `OpenAPIGenerator`.

- [ ] **Step 5: Verify generation by referencing a generated symbol**

Add a temporary file `ios/Vendpire/Services/VendpireAPI/GeneratedSmokeCheck.swift`:

```swift
import Foundation

// Temporary: proves the plugin ran and the types exist. Deleted in Task 9.
private func generatedTypesExist(_ product: Components.Schemas.Product) -> Int {
    product.defaultPriceCents
}
```

The return type is `Int`, not `Double` — if this does not compile, Task 1 did not land or the symlink points at a stale document.

- [ ] **Step 6: Build**

Run: `bun run ios:build`

Expected: BUILD SUCCEEDED. On failure, check in order: the plugin is listed in Build Phases; both yaml files appear in Build Phases → Copy Bundle Resources or the target's file list; the symlink resolves (`cat ios/Vendpire/Services/VendpireAPI/openapi.yaml | head -3`).

- [ ] **Step 7: Delete the smoke check and rebuild**

```bash
rm ios/Vendpire/Services/VendpireAPI/GeneratedSmokeCheck.swift
```

Remove its reference in Xcode, then run `bun run ios:build` again. Expected: BUILD SUCCEEDED.

- [ ] **Step 8: Commit**

```bash
git add ios/Vendpire.xcodeproj ios/Vendpire/Services/VendpireAPI
git commit -m "build(ios): generate the API client from openapi/vendpire.yaml

A build-tool plugin rather than committed output, so a spec change is a
compile error. openapi.yaml is a symlink to the committed document — one
source of truth."
```

### Task 9: Map generated types to `Remote*`

**Files:**
- Create: `ios/Vendpire/Services/VendpireAPI/Remote+Generated.swift`

**Interfaces:**
- Consumes: `Components.Schemas.*` (Task 8); the `Remote*` structs (Tasks 3, 5, 6).
- Produces: `init(_:)` on `RemoteIdentity`, `RemoteLocation`, `RemoteMachine`, `RemoteProduct`, `RemotePack`, `RemotePlanogram`, `RemoteVisit` taking their generated counterparts. Task 10 calls these.

**Background:** `Location.commission` is the only `oneOf` in the document and generates a Swift enum with three cases, which has to be flattened into the existing `Commission` struct (`type: String`, `percentBps: Int?`, `flatCents: Int?`, `basis: String?`). The enums for `Machine.kind` and `cardReader.provider` map via `.rawValue` — deliberately loose, so an unrecognised value from a newer server does not make a machine vanish. There is no `deletedAt` anywhere on the surface; pass `nil`.

- [ ] **Step 1: Write the mapping**

Create `ios/Vendpire/Services/VendpireAPI/Remote+Generated.swift`:

```swift
import Foundation

/// Generated OpenAPI types in, `Remote*` out. The only file in the app that
/// knows the generated types exist.
///
/// This is where a spec change becomes a compile error. The cost of the extra
/// hop is that stubs stay two lines and the bundled fixture is still valid test
/// input — see the Phase 7 design doc.
///
/// Dates arrive already decoded: the generator's transcoder handles the
/// `format: date-time` fields, so `RemoteOrg.makeDecoder()` is not involved.

extension RemoteIdentity {
    init(_ generated: Components.Schemas.Identity) {
        self.init(userId: generated.userId, orgId: generated.orgId)
    }
}

extension RemoteLocation {
    init(_ generated: Components.Schemas.Location) {
        self.init(
            id: generated.id,
            name: generated.name,
            address: PostalAddress(generated.address),
            contact: ContactInfo(generated.contact),
            commission: Commission(generated.commission),
            notes: generated.notes,
            active: generated.active,
            // Not on the REST surface at all — see the plan's context notes.
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension PostalAddress {
    init(_ generated: Components.Schemas.Location.AddressPayload) {
        self.init(
            line1: generated.line1,
            city: generated.city,
            state: generated.state,
            zip: generated.zip,
            geo: generated.geo.map { GeoPoint(lat: $0.lat, lng: $0.lng) }
        )
    }
}

extension ContactInfo {
    init(_ generated: Components.Schemas.Location.ContactPayload) {
        self.init(name: generated.name, phone: generated.phone, email: generated.email)
    }
}

extension Commission {
    /// Flattens the document's one `oneOf` into the stored struct. `type` stays
    /// a raw String so a fourth arm from a newer server cannot fail the decode
    /// and make the whole location vanish.
    init(_ generated: Components.Schemas.LocationCommission) {
        switch generated {
        case .case1:
            self.init(type: "none", percentBps: nil, flatCents: nil, basis: nil)
        case .case2(let percent):
            self.init(
                type: "percent",
                percentBps: percent.percentBps,
                flatCents: nil,
                basis: percent.basis.rawValue
            )
        case .case3(let flat):
            self.init(type: "flat", percentBps: nil, flatCents: flat.flatCents, basis: nil)
        }
    }
}

extension RemoteMachine {
    init(_ generated: Components.Schemas.Machine) {
        self.init(
            id: generated.id,
            locationId: generated.locationId,
            name: generated.name,
            kind: generated.kind.rawValue,
            make: generated.make,
            model: generated.model,
            serial: generated.serial,
            tagCode: generated.tagCode,
            slots: generated.slots,
            cardReader: generated.cardReader.map {
                CardReader(provider: $0.provider.rawValue, deviceId: $0.deviceId)
            },
            active: generated.active,
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension RemoteProduct {
    init(_ generated: Components.Schemas.Product) {
        self.init(
            id: generated.id,
            name: generated.name,
            upc: generated.upc,
            category: generated.category,
            taxClass: generated.taxClass,
            imageUrl: generated.imageUrl,
            defaultPriceCents: generated.defaultPriceCents,
            active: generated.active,
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension RemotePack {
    init(_ generated: Components.Schemas.Pack) {
        self.init(
            id: generated.id,
            name: generated.name,
            barcodes: generated.barcodes,
            contents: generated.contents.map {
                PackContent(productId: $0.productId, units: $0.units)
            },
            active: generated.active,
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension RemotePlanogram {
    init(_ generated: Components.Schemas.Planogram) {
        self.init(
            id: generated.id,
            machineId: generated.machineId,
            effectiveFrom: generated.effectiveFrom,
            slots: generated.slots.map {
                PlanogramSlot(
                    slotCode: $0.slotCode,
                    productId: $0.productId,
                    par: $0.par,
                    priceCents: $0.priceCents
                )
            },
            deletedAt: nil,
            updatedAt: generated.updatedAt
        )
    }
}

extension RemoteVisit {
    init(_ generated: Components.Schemas.Visit) {
        self.init(
            id: generated.id,
            machineId: generated.machineId,
            countedAt: generated.countedAt,
            lines: generated.lines.map {
                RemoteVisitLine(
                    slotCode: $0.slotCode,
                    productId: $0.productId,
                    remaining: $0.remaining,
                    added: $0.added,
                    removed: $0.removed
                )
            }
        )
    }
}
```

- [ ] **Step 2: Build**

Run: `bun run ios:build`

Expected: BUILD SUCCEEDED. Generated nested-type names (`AddressPayload`, `case1`/`case2`/`case3`) are the generator's convention but can differ by version — if the compiler disagrees, read the generated file it points at and use the names it actually emitted rather than forcing these.

**If any money field errors with "cannot convert value of type 'Double' to expected argument type 'Int'", Task 1 did not land or the symlink is stale. Do not insert an `Int(...)` conversion — that is the truncation the prerequisite PR exists to prevent.**

- [ ] **Step 3: Run the tests**

Run: `bun run ios:test`

Expected: all tests still pass; nothing calls this file yet.

- [ ] **Step 4: Commit**

```bash
git add ios/Vendpire/Services/VendpireAPI/Remote+Generated.swift
git commit -m "feat(ios): map generated OpenAPI types to the Remote structs

Confines the generated types to one file, which is where a spec change
becomes a compile error."
```

### Task 10: Build `VendpireAPIClient`

**Files:**
- Create: `ios/Vendpire/Services/VendpireAPI/AuthTokenMiddleware.swift`
- Create: `ios/Vendpire/Services/VendpireAPI/VendpireAPIClient.swift`

**Interfaces:**
- Consumes: `VendpireAPI` (Task 6), the `Remote*` initialisers (Task 9), `AppEnvironment.apiBaseURL`.
- Produces: `VendpireAPIClient()` conforming to `VendpireAPI`. Task 11 constructs it.

**Background:** Clerk session tokens have a 60-second TTL, so `getToken()` must be called per request rather than held. That is survivable: enough signal to reach the Vendpire API means enough to reach Clerk's, so the refresh happens in the same connectivity window. The cost is two round trips in marginal signal.

- [ ] **Step 1: Write the auth middleware**

Create `ios/Vendpire/Services/VendpireAPI/AuthTokenMiddleware.swift`:

```swift
import ClerkKit
import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Stamps a fresh Clerk token on every request.
///
/// Fetched per request, not cached: the TTL is 60 seconds, so a held token is
/// expired more often than not. A missing token is not an error here — the
/// request goes out bare and the server answers 401, which is the one place
/// that decision belongs.
struct AuthTokenMiddleware: ClientMiddleware {
    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if let token = try? await Clerk.shared.auth.getToken() {
            request.headerFields[.authorization] = "Bearer \(token)"
        }
        return try await next(request, body, baseURL)
    }
}
```

- [ ] **Step 2: Write the client**

Create `ios/Vendpire/Services/VendpireAPI/VendpireAPIClient.swift`:

```swift
import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// The real network implementation of `VendpireAPI`.
///
/// Every method shape is the same: call the generated operation, take the one
/// documented success case, map to `Remote*`. Any other status — 401, 403, 426,
/// 500 — throws, and `MirrorRefresher` turns that into a failed refresh that
/// writes nothing.
struct VendpireAPIClient: VendpireAPI {
    private let client: Client

    init(baseURL: URL = AppEnvironment.apiBaseURL) {
        client = Client(
            serverURL: baseURL,
            transport: URLSessionTransport(),
            middlewares: [AuthTokenMiddleware()]
        )
    }

    func fetchIdentity() async throws -> RemoteIdentity {
        let response = try await client.getCurrentIdentity(.init())
        let identity = try response.ok.body.json
        return RemoteIdentity(identity)
    }

    func fetchLocations() async throws -> [RemoteLocation] {
        let response = try await client.listLocations(.init())
        let locations = try response.ok.body.json
        return locations.map(RemoteLocation.init)
    }

    func fetchMachines() async throws -> [RemoteMachine] {
        let response = try await client.listMachines(.init())
        let machines = try response.ok.body.json
        return machines.map(RemoteMachine.init)
    }

    func fetchProducts() async throws -> [RemoteProduct] {
        let response = try await client.listProducts(.init())
        let products = try response.ok.body.json
        return products.map(RemoteProduct.init)
    }

    func fetchPacks() async throws -> [RemotePack] {
        let response = try await client.listPacks(.init())
        let packs = try response.ok.body.json
        return packs.map(RemotePack.init)
    }

    func fetchCurrentPlanograms() async throws -> [RemotePlanogram] {
        let response = try await client.listCurrentPlanograms(.init())
        let planograms = try response.ok.body.json
        return planograms.map(RemotePlanogram.init)
    }

    func fetchLatestVisits() async throws -> [RemoteVisit] {
        let response = try await client.listLatestVisits(.init())
        let visits = try response.ok.body.json
        return visits.map(RemoteVisit.init)
    }
}
```

Each method names its intermediate value rather than chaining through the `await` — per `CLAUDE.md`, an awaited value that is then destructured or member-accessed gets a name on its own line.

- [ ] **Step 3: Build**

Run: `bun run ios:build`

Expected: BUILD SUCCEEDED. If `response.ok` is spelled differently, read the generated `Client.swift` for the actual operation names and output enum cases.

- [ ] **Step 4: Run the tests**

Run: `bun run ios:test`

Expected: all tests pass. `MirrorRefresherTests` still uses the stub; nothing here is unit-tested, deliberately — it is the one layer whose correctness is a wire question, covered by the manual checks in Task 12.

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/Services/VendpireAPI
git commit -m "feat(ios): call /api/v1 through the generated client

Clerk's token is fetched per request — a 60-second TTL means a held one is
expired more often than not."
```

### Task 11: Refresh on launch and foreground instead of seeding the fixture

**Files:**
- Modify: `ios/Vendpire/VendpireApp.swift`

**Interfaces:**
- Consumes: `MirrorRefresher` (Task 7), `VendpireAPIClient` (Task 10).
- Produces: a `MirrorRefresher` in the SwiftUI environment. Task 12 reads its `state`.

**Background:** `DevFixtureLoader` is **not deleted** — it stays for previews and tests, which is what the Phase 7 subtask asks for. Only the launch call goes away.

- [ ] **Step 1: Replace the seed with a refresh**

Rewrite the body of `ios/Vendpire/VendpireApp.swift`:

```swift
@main
struct VendpireApp: App {
    @State private var session = ClerkSession()
    @State private var clientSupport = ClientSupport()
    @State private var lock = LocalLock()
    @State private var refresher: MirrorRefresher
    private let container: ModelContainer

    @Environment(\.scenePhase) private var scenePhase

    init() {
        Clerk.configure(publishableKey: AppEnvironment.clerkPublishableKey)
        let container = VendpireStore.makeContainer()
        self.container = container
        _refresher = State(
            initialValue: MirrorRefresher(
                api: VendpireAPIClient(),
                writer: MirrorWriter(context: container.mainContext)
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            RootView(lock: lock, clientSupport: clientSupport)
            .environment(session)
            .environment(clientSupport)
            .environment(refresher)
            .modelContainer(container)
            .task {
                #if DEBUG
                clientSupport.applyLaunchArgumentOverride()
                #endif
                // Clerk rehydrates a persisted session itself; this only reads
                // the result. It must never gate what is shown — a cold offline
                // launch is expected to fail here.
                session.refreshFromClerk()
                await refresher.refresh()
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                Task { await refresher.refresh() }
            }
        }
    }
}
```

The store renders before this runs — `RootView` reads `StoreMetadata` via `@Query` — so a failed refresh leaves whatever was already there, which is the rule this phase exists to honour.

- [ ] **Step 2: Build and launch against the running API**

Start the API: `bun run dev:api` (this worktree listens on **3211**, matching `ios/Config/Debug.xcconfig`).

Run: `bun run ios:run -- -skipLock`

- [ ] **Step 3: Verify the store fills from the network**

Sign in via the Account screen, then background and foreground the app. Expect the location list to populate. Confirm it came from the network rather than the fixture by checking a record that only exists server-side, or by stopping the API and relaunching — the data must still be there.

- [ ] **Step 4: Run the tests**

Run: `bun run ios:test`

Expected: all tests pass, `DevFixtureLoaderTests` included — the loader still works, it is just no longer called at launch.

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/VendpireApp.swift
git commit -m "feat(ios): fill the mirror from the API on launch and foreground

DevFixtureLoader stays for previews and tests; only the launch seed goes."
```

### Task 12: Show staleness and let someone retry

**Files:**
- Modify: `ios/Vendpire/Features/LocationList/LocationListView.swift`

**Interfaces:**
- Consumes: `MirrorRefresher.state` (Task 7), `StoreMetadata.lastSyncedAt`.
- Produces: the user-visible half of the phase. Nothing depends on it.

**Background:** The floor — never an empty state, never clear the store — says only what not to do. A refresh that quietly fails forever is its own failure: someone with a three-day-old mirror cannot tell "nothing changed" from "broken since Tuesday." The three causes (offline, signed out, server error) are deliberately **not** distinguished yet; that classification earns its place in Phase 8's outbox routing, where the cause is actionable.

- [ ] **Step 1: Add the badge and pull-to-refresh**

In `ios/Vendpire/Features/LocationList/LocationListView.swift`, add to the view:

```swift
    @Environment(MirrorRefresher.self) private var refresher
    @Query private var metadata: [StoreMetadata]

    /// The badge reads the store, not the refresher: the age of the data is the
    /// fact that matters, and it outlives any one refresh attempt.
    private var stalenessText: String? {
        guard let syncedAt = metadata.first?.lastSyncedAt else { return nil }
        let age = syncedAt.formatted(.relative(presentation: .named))
        if case .failed = refresher.state {
            return "As of \(age) · couldn't reach the server"
        }
        return "As of \(age)"
    }
```

and attach both to the `Group`, alongside the existing `.navigationTitle("Locations")`:

```swift
        .refreshable { await refresher.refresh() }
        .safeAreaInset(edge: .bottom) {
            if let stalenessText {
                Text(stalenessText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(.bar)
            }
        }
```

`safeAreaInset` rather than `.overlay`, for the same reason `UpdateRequiredView` uses it: an overlay leaves the last row permanently hidden under the badge, while an inset shrinks the content's safe area so the list still scrolls to its end.

Note that `.refreshable` only fires over the `List`. When `locations.isEmpty` the `Group` renders a `ContentUnavailableView`, which does not scroll — so there is nothing to pull. Acceptable: an empty store means nothing has ever synced, which is the one case the badge has nothing to say about either.

- [ ] **Step 2: Build**

Run: `bun run ios:build`

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Verify the success path**

With the API running: `bun run ios:run -- -skipLock`, then `bun run ios:screenshot`.

Expected: the badge reads "As of now" or similar, with no failure clause.

- [ ] **Step 4: Verify the failure path — the rule this phase exists for**

Stop the API (`Ctrl-C` on `dev:api`). Force-quit and relaunch the app.

Run: `bun run ios:screenshot`

Expected: **the location list still renders every location**, and the badge reads "As of … · couldn't reach the server". If the list is empty, the refresh cleared the store and Task 7's guarantee is broken — stop and report rather than patching the view.

- [ ] **Step 5: Verify pull-to-refresh recovers**

Restart the API, pull down on the list.

Expected: the failure clause disappears and the date updates.

- [ ] **Step 6: Run the tests**

Run: `bun run ios:test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add ios/Vendpire/Features/LocationList/LocationListView.swift
git commit -m "feat(ios): show how stale the mirror is, and let someone retry

A refresh that fails silently forever is its own failure — the badge tells
'nothing changed' apart from 'broken since Tuesday'. The three causes stay
undistinguished until the outbox makes them actionable."
```

---

## Out of scope

Tracked on their own cards, deliberately not addressed here:

| Deferred | Why |
|---|---|
| `ImageCache` — URL hash → Caches dir | Independent of the fan-in; no scaffolding exists |
| `ClientSupportMiddleware`, launch/foreground verdict check | Owned by the "Forced update" card; `AuthTokenMiddleware` establishes the stack it slots into |
| Physical-device LAN check (`NSAllowsLocalNetworking`) | Manual verification needing a device on the same network |
| The org mismatch subtask | See below |

### The org mismatch is unresolved

The Phase 7 card records route data in `org_3JtVfg4…` and the phone signing into `org_3KL2Mt9…`. The bundled fixture is a **third** org, `org_3KCN5Mql3NLnO2aIvsnYKkTDsQv`, exported 2026-10-20. Either this was resolved by re-seeding or there are three orgs in play; it is not answerable from the code.

It matters to Task 11: the first real refresh stamps `StoreMetadata` from `/me`, so if the signed-in org differs from the fixture's, `wipeIfOrgChanged` clears the store and refills it. **That is correct behaviour and it will look like data loss the first time it happens.** Expect it during Task 11, Step 3.
