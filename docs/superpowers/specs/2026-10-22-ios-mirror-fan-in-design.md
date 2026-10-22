# iOS mirror — fan-in and the transaction boundary

> **Status:** design of record as of 2026-10-22. Covers the core of Phase 7:
> how six independent REST reads become one `MirrorWriter.apply`, and what
> happens when some of them fail. Scoped deliberately narrower than the Phase 7
> shuffleboard card — `ImageCache`, `ClientSupportMiddleware`, the
> physical-device check and the org mismatch are named at the end as
> out of scope, not solved here.

## Goal

**Replace `DevFixtureLoader` with a real refresh over `/api/v1`, without ever
letting a failed network call destroy the store.**

Phase 2 built the mirror's write half and proved it: `MirrorWriter` upserts by
server id, removes what the payload no longer carries, stamps `StoreMetadata`,
and `MirrorWriterTests` covers it including ragged shelves. What's missing is a
byte source. The card calls the swap "a byte-source swap, not a rewrite" and
that is accurate — but only if the fan-in is shaped correctly, because of one
property of the writer described next.

### Remove-missing makes a partial payload destructive

`MirrorWriter.reconcile` deletes any stored row absent from the array it is
handed. That is the step that makes the mirror correct — a machine deleted
months ago has to disappear from the phone — and it is why the writer is safe to
re-run.

It also means **a failed fetch is not "less data," it is deletion.** If
`GET /products` times out and the refresh hands the writer `products: []`, every
product in the store is deleted. The obvious implementation — six `try?` calls,
assemble whatever came back — is a store wipe wearing a refresh's clothes, and
it violates the rule the card states twice: *a failing refresh must never clear
or hide the store.*

Everything below follows from designing that hazard out rather than guarding
against it.

### The shape mismatch

`MirrorWriter.apply` takes one `RemoteOrg` — `orgId`, a timestamp, and five
entity arrays. That shape came from the fixture, which is one JSON file.

The REST surface is six separate `GET`s returning bare arrays, carrying no
envelope, no org, and no timestamp.

```
GET /me                   → orgId            (the only real dependency)
GET /locations            → [Location]   ┐
GET /machines             → [Machine]    │
GET /products             → [Product]    ├─ one unit, all-or-nothing
GET /packs                → [Pack]       │
GET /planograms/current   → [Planogram]  ┘
GET /visits/latest        → [Visit]      ─  separate boundary, may fail alone
```

## Design

### 1. Prerequisite — the read path declares money as `number`

**This ships as its own PR, before any Phase 7 work.**

Phase 6's output schemas use bare `z.number()` where the POST input schemas use
`z.number().int()`. The nine `type: integer` entries in `openapi/vendpire.yaml`
are all request bodies; every response field is `type: number`:

| Field | Schema | File |
|---|---|---|
| `defaultPriceCents` | Product | `packages/api/src/schemas/product.ts:14` |
| `priceCents`, `par` | Planogram slot | `packages/api/src/schemas/planogram.ts:15-16` |
| `percentBps`, `flatCents` | Location commission | `packages/api/src/schemas/location.ts:15,18` |
| `units` | Pack content | `packages/api/src/schemas/pack.ts:14` |
| `remaining`, `added`, `removed`, `priceCents`, `par` | Visit line | `packages/api/src/schemas/visit.ts:29-47` |
| `units`, `totalCostCents`, `receiptTotalCents` | Purchase | `packages/api/src/schemas/purchase.ts:13-15` |

`swift-openapi-generator` maps `type: number` to `Double`. Left alone, the
generated client hands back `Double` for every price on the read path and the
adapter in §3 becomes a wall of `Int(generated.priceCents)` — a silent
truncation site on money, in a codebase whose stated rule is *money is `Int`
cents everywhere, never `Double`, never `Decimal`.*

**Why the existing guard cannot catch this.** Phase 6's `Exactly<Dto, S>` helper
compares `z.infer<S>` against the entity type. TypeScript has no integer type,
so `z.number()` and `z.number().int()` both infer `number` and both satisfy
`Exactly<>`. The check is structurally blind to int-ness. For the same reason,
adding `.int()` cannot break it.

Fix: `z.number()` → `z.number().int()` across those six files, then
regenerate. The committed-doc-matches-fresh-generation test means the updated
YAML lands in the same commit or CI fails.

### 2. Transaction boundary — reference data is one unit, visits are a leaf

Three options were considered. The chosen one:

**All-or-nothing across the five mirrored entities; `visits/latest` separate.**

Reference data is cross-referential — machines name locations, planograms name
machines and products — so a torn mirror renders blank cells on the face grid
with no error surfaced anywhere. The Machine-face card already records that a
dangling `productId` "renders a blank cell for no visible reason," which is
exactly what partial application would manufacture at scale.

Latest-visits are a leaf: nothing joins against them, so losing a refresh of
them tears nothing.

Rejected:

- **Per-entity commit.** Preserves partial progress at the cost of an
  internally inconsistent store whose only symptom is silently wrong rendering.
- **Everything all-or-nothing, visits included.** Makes the whole refresh
  hostage to the one endpoint with no consumer yet.

A note on vocabulary: the card's subtask says "one transaction per entity," but
`ModelContext` is not transactional in the database sense — it accumulates
changes and `save()` flushes them. The real question is not where to `save()`,
it is **whether all five fetches must succeed before anything is written.** They
must.

### 3. Components

Four pieces, three new.

**`VendpireAPI`** — the existing empty protocol gains seven methods, all vending
`Remote*` rather than generated types:

```swift
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

`RemoteIdentity` and `RemoteVisit` are new. The other five are unchanged.

**`VendpireAPIClient`** — the only file importing generated code. Builds the
generated `Client` with `AppEnvironment.apiBaseURL` and the middleware stack,
calls it, returns `Remote*`.

**`Remote+Generated.swift`** — the mapping, as extensions, mirroring the
existing `StoredEntities+Remote.swift` convention.

**`MirrorRefresher`** — `@MainActor @Observable`, owning a `VendpireAPI` and a
`MirrorWriter`. Exposes intent and status, never rows.

#### Why `Remote*` survives rather than using generated types directly

`ios/ARCHITECTURE.md` makes `VendpireAPI` the single seam and puts the
orchestration tests — the ones that catch losing field data — against a stub.
If the protocol vended generated types, every stub in every test would
construct verbose nested generated values that reshape whenever the spec moves,
and the fixture would have to decode as generated types (whose default date
transcoder rejects the fractional seconds the server emits — the exact thing
`RemoteOrg.makeDecoder()` exists to absorb).

The "a spec change is a compile error" guarantee is not lost. It moves into
`Remote+Generated.swift`, one file earlier.

**Revisit point, raised during design and recorded deliberately:** the extra hop
(generated → `Remote*` → `Stored*`) can read as defeating the purpose of
generated types. It is reversible — deleting `Remote*` and re-pointing
`MirrorWriter` at the generated types is mechanical. Judge it once
`Remote+Generated.swift` exists rather than in the abstract.

### 4. The refresh sequence

```swift
func refresh() async {
    state = .refreshing
    do {
        let identity = try await api.fetchIdentity()
        guard let orgId = identity.orgId else {
            state = .failed(message: "You're not in an organization.")
            return
        }

        // Serial and early-exit: offline should cost one failed request, not five.
        let locations = try await api.fetchLocations()
        let machines = try await api.fetchMachines()
        let products = try await api.fetchProducts()
        let packs = try await api.fetchPacks()
        let planograms = try await api.fetchCurrentPlanograms()

        let syncedAt = Date()
        let org = RemoteOrg(orgId: orgId, locations: locations, machines: machines,
                            products: products, packs: packs, planograms: planograms)
        try writer.apply(org, syncedAt: syncedAt)
        state = .synced(at: syncedAt)
    } catch {
        state = .failed(message: describe(error))
        return
    }

    // A leaf: failing here leaves the reference mirror fresh and the refresh good.
    if let visits = try? await api.fetchLatestVisits() {
        try? writer.applyLatestVisits(visits)
    }
}
```

**No array reaches the writer until all five have arrived.** There is no code
path that can hand `reconcile` a partial list, so the destructive case from the
Goal section is unreachable by construction rather than by discipline.

**Serial, not parallel.** Six concurrent requests on marginal signal produce six
timeouts and six retries; serial early-exit produces one. The payload is well
under 100 KB, so the cost is a few hundred milliseconds on a background refresh
nobody is watching.

**Visits are applied after reference data**, so their `machineId` and
`productId` resolve against rows that are already current.

#### `orgId` comes from `/me`, not the Clerk token

The org stamped into `StoreMetadata` must come from the same authority that
scoped the six responses. Stamping what the *client* believes while storing what
the *server* returned means `wipeIfOrgChanged` can never fire — which is
precisely the cross-org leak that "no `orgId` on any entity" exists to make
impossible.

#### `orgId: nil` short-circuits

The six calls are skipped entirely — they would `403` anyway — and the state
carries the member-less message. The spec's own description for the field says
it is "how a member-less user discovers why they are stuck." **No wipe:** a
member-less user is a recoverable state, and the store stays put.

#### The timestamp becomes a parameter, and `exportedAt` leaves `RemoteOrg`

`MirrorWriter.apply` currently reads `remote.exportedAt` to stamp
`lastSyncedAt`. That is right for a fixture genuinely exported at a known time
and wrong for a payload the device just assembled a second ago.

The signature becomes `apply(_ org: RemoteOrg, syncedAt: Date)` and
**`exportedAt` is removed from `RemoteOrg` entirely.** Keeping both would make
`MirrorRefresher` pass the same clock reading twice — once into the aggregate it
builds, once into the writer — which is the kind of duplication that drifts.

`Decodable` ignores unknown keys, so the fixture JSON keeps its `exportedAt`
field harmlessly and `packages/api/scripts/exportIosFixture.ts` needs no change.

| Caller | Passes as `syncedAt` |
|---|---|
| `DevFixtureLoader` | `Date()` — the seed really did just happen |
| `MirrorRefresher` | `Date()` |

`MirrorWriterTests:100-106` currently asserts `lastSyncedAt` equals the
payload's `exportedAt`; it passes an explicit `syncedAt:` instead. That is a
better test — the stamp is no longer coupled to the payload.

### 5. The rollback fix

`MirrorWriter.apply` has no rollback. `reconcile` can throw from
`context.fetch` partway through — after inserts and deletes have been staged but
before `save()`. Those pending changes do not disappear; they are flushed by the
*next* `save()` from anywhere in the app, writing a half-applied mirror at an
unrelated moment.

Unreachable today, because `DevFixtureLoader` applies one local payload at launch
and nothing else writes. It becomes reachable the moment refreshes run
repeatedly against a network.

```swift
do {
    // …reconcile…
    try context.save()
} catch {
    context.rollback()
    throw error
}
```

This is what makes "a failed refresh leaves the store exactly as it was" true at
the storage layer and not only at the call site. In scope for this phase: it is
the transaction boundary the card's subtask names.

### 6. `StoredLatestVisit`

```swift
@Model
final class StoredLatestVisit {
    #Unique<StoredLatestVisit>([\.machineId])

    var id: String = ""
    var machineId: String = ""
    var countedAt: Date = .distantPast
    var lines: [VisitLineSnapshot] = []
}

nonisolated struct VisitLineSnapshot: Codable, Equatable, Hashable, Sendable {
    var slotCode: String
    var productId: String
    var remaining: Int
    var added: Int
    var removed: Int
}
```

**Keyed on `machineId`, not the visit id.** The endpoint's contract is one visit
per machine, so machineId is the real invariant, and it makes a new visit an
in-place update rather than a delete-plus-insert.

**The prior count is computed, never stored**, matching the server rule that
nothing derived is persisted:

```swift
// Domain/VisitLevels.swift
extension VisitLineSnapshot {
    /// What was left in the slot when the operator walked away.
    /// Named to match `levelAfter` in packages/domain/src/visits/sold.ts so the
    /// two implementations do not drift.
    var levelAfter: Int { remaining + added - removed }
}
```

Two consequences for the writer:

- `StoredLatestVisit.self` joins `VendpireStore.schema`.
- It joins the delete list in `wipeIfOrgChanged`. It is org-scoped data carrying
  no `orgId`, so the wipe is the only thing between it and a cross-org leak.

**Deliberately omitted:** `priceCents`, `par`, `removedReason`, `bestBy`, and the
record metadata. Price and par for a *new* visit come from the current
planogram, not the prior visit, so they would be stored and never read.
`bestBy` is the close call — the in-progress Expiration card would want it — but
adding an optional property to a SwiftData model is an additive, lightweight
migration, so deferring costs little.

### 7. Failure surfacing

```swift
enum MirrorState {
    case idle
    case refreshing
    case failed(message: String)
    case synced(at: Date)
}
```

The card's floor — never an empty state, never clear the store, badge keeps the
old date — says only what not to do. A refresh that quietly fails forever is its
own failure: someone standing at a machine with a three-day-old mirror cannot
tell "nothing changed" from "this has been broken since Tuesday."

So the badge distinguishes *"as of 3 days ago"* from *"as of 3 days ago ·
couldn't reach the server."* Still passive, still never blocking.

**The three causes — offline, signed out, server error — are deliberately not
distinguished yet.** Classifying them now builds a table nothing acts on;
Phase 8's response-routing table in `docs/diagrams/visit-sync.md` is where
classification earns its place, because a stuck submit makes the cause
actionable.

### 8. Triggers

Launch and foreground, per the card. Plus pull-to-refresh on the location list —
roughly two lines, and the only way for someone to act on a badge that says the
server is unreachable.

### 9. Retiring `DevFixtureLoader`

It is not deleted. `VendpireApp.seedStore()` stops calling it and
`MirrorRefresher.refresh()` takes its place; the loader stays for previews and
tests, which is what subtask 3 asks for. `MirrorWriter`,
`StoredEntities+Remote`, the fixture, `MirrorWriterTests` and
`DevFixtureLoaderTests` are unchanged apart from the `syncedAt` argument.

## Testing

Orchestration tests against a `StubVendpireAPI` and an in-memory container —
the arrangement `ARCHITECTURE.md` names as the reason the seam exists.

| # | Case | Proves |
|---|---|---|
| 1 | All seven calls succeed | Store matches the payload |
| 2 | `/products` throws | **Store completely unchanged, state `.failed`** |
| 3 | `/visits/latest` throws | Reference data applied, state `.synced` |
| 4 | `/me` returns a different org | Everything wiped and reseeded, including `StoredLatestVisit` |
| 5 | `/me` returns `orgId: nil` | Zero further calls, zero writes, member-less message |
| 6 | Refresh twice | Converges, no duplicates |

Case 2 is subtask 7 — a refresh cannot delete the catalog. Case 3 is the
transaction boundary made observable.

Plus one unit test for §5: a writer whose context throws mid-reconcile leaves
nothing staged.

### These must run on a device, not the Simulator

Every case constructs app-module `@Observable` types and a `ModelContainer` —
the exact profile of the 9 tests that abort the test host and are *silently
skipped* in the Simulator, leaving the suite green while missing cases. Six new
tests reporting green without executing would be worse than no tests.

The `resolveSim` fix on the "ios:test runs on the Simulator" card is effectively
a prerequisite.

## Scope

**In:** the §1 spec fix (own PR, first), the `swift-openapi-generator` build
plugin, `VendpireAPIClient` + `Remote+Generated`, `MirrorRefresher`, the
rollback fix, `StoredLatestVisit` + `levelAfter`, retiring `DevFixtureLoader`
from the launch path, the staleness badge with `.failed` distinguished, launch +
foreground triggers, pull-to-refresh.

**Out, deferred to their own cards:**

| Deferred | Why |
|---|---|
| `ImageCache` | Independent of the fan-in; no scaffolding exists |
| `ClientSupportMiddleware`, launch/foreground verdict check | Owned by the "Forced update" card |
| Physical-device LAN check (`NSAllowsLocalNetworking`) | Manual verification, needs a device |
| The org mismatch subtask | Cannot be assessed without the API and Mongo running — see below |

### Open question — the org mismatch

The Phase 7 card records route data in `org_3JtVfg4…` and the phone signing into
`org_3KL2Mt9…`. The bundled fixture is a **third** org,
`org_3KCN5Mql3NLnO2aIvsnYKkTDsQv`, exported 2026-10-20. Either this was already
resolved by re-seeding or there are now three orgs in play. Unresolvable from
the code alone.

It matters here for one reason: §4 stamps `StoreMetadata` from `/me`, so the
first real refresh against a signed-in session will wipe the fixture-seeded
store if the orgs differ. That is correct behaviour, and it will look like data
loss the first time it happens.

## Verification

- §1: regenerate `openapi/vendpire.yaml`; the committed-doc test passes and the
  money fields read `type: integer`.
- The six orchestration tests above, **run on a physical device**.
- Manual: airplane mode, cold launch → store renders, badge says "couldn't
  reach the server," nothing disappears.
- Manual: sign in, refresh, kill, relaunch offline → mirrored data still
  renders with the prior badge date.
