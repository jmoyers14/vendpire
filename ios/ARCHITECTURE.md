# Vendpire iOS — architecture

Decisions and, more importantly, the reasoning behind them. The structure is
easy to re-derive from the code; the *why* is what evaporates.

Plan of record: `docs/plans/2026-10-05-visits-and-ios.md`. Where this document
disagrees with it, see "Divergences" at the end.

The mirror and outbox this layering serves are drawn in
`docs/diagrams/visit-sync.md`.

## The layering

```
    Views                          reads
  (@Query)  ──────────────────────────────────────►  SwiftData store
     │                                                      ▲
     │  intents: refresh(), submit(draft), signIn()         │  ALL writes
     ▼                                                      │
  Services ───────────►  VendpireAPI  ───────────────────────┘
```

This mirrors the backend — `router → service → repository → model` becomes
`view → service → ModelContext → @Model`.

**One rule carries the whole design: views never write to the store and never
touch the network.** Views read with `@Query` and call service methods;
services own every write. Without that constraint, orchestration smears across
view bodies as `.task { let data = try await api.fetch(); context.insert(…) }`,
and it is unfixable later because each screen grows its own variant.

## Reads and writes are separate mechanisms

Services expose **intents and status**, never data:

```swift
@Observable final class SyncService {
    private(set) var state: SyncState   // .idle | .syncing | .failed | .synced(at:)
    func refresh() async                // writes into the store, returns no rows
}
```

Rows always come from `@Query`. A service that also returned data would become a
second cache competing with SwiftData. Keeping the store as the single source of
truth — not the network response — is what makes offline behaviour correct by
construction: no screen needs to know whether a sync just happened.

The equivalent split in React is queries vs mutations: `useQuery` reads,
mutations write and expose status, and the cache is authoritative.

## No view models yet

Apple does not prescribe an architecture, and deliberately so — "MVVM" appears
nowhere in the SwiftUI documentation. Apple's own samples inject models into
views and use `@Query` in view bodies with no view-model layer.

For read-only screens a `@Observable` wrapper would be pass-through boilerplate
that also forfeits `@Query`'s automatic change tracking, forcing hand-rolled
refetch after every write. So: `@Query` for fetching, and **pure functions for
anything with logic**.

The face grid's `slot → planogram → product` join is the real case. It lives in
`Domain/` as a function over plain values, because that is where the
"never infer layout from codes" rule lives and it deserves unit tests that need
no SwiftData, no simulator, and no fixture.

View models arrive in Phase 8, where visit capture brings genuine mutable
state — counts being typed, a draft assembled, outbox retries. That is a view
model earning its place rather than being installed on principle.

## One seam, at the network edge

`VendpireAPI` is a protocol. Services are concrete types taking a `ModelContext`.

Tests run the real service against a stub API and an in-memory container
(`ModelConfiguration(isStoredInMemoryOnly: true)`), which makes orchestration the
most-tested layer rather than the least. The cases worth covering are the ones
that lose field data: a full refresh removing a machine the server dropped, a
draft persisted *before* the network call and surviving a failed submit, a
repeated `clientRequestId` not double-posting, a 500 leaving the outbox queued.

Protocols for every service would mirror the backend's ports-and-adapters more
closely, but a protocol with exactly one implementation is ceremony.

## Auth never gates the store

```
VendpireApp
 └─ LocalLockGate              ← biometric / passcode: the ONLY gate
     └─ RootView
         ├─ LocationList → MachineList → MachineFace   (never checks auth)
         └─ AccountView                                 (sign-in lives here)
```

**Not** `if clerk.user == nil { SignInView } else { RootView }`, which is what
Clerk's quickstart shows and is exactly wrong here. A cold offline launch is
expected to fail `Clerk.load()`; gating the app on that hides the entire store
from someone standing at a machine with no signal.

Gate the *app* on the local lock. Gate only the *network* on the token.

## One org on the device

A single `StoreMetadata` record holds the org the store currently mirrors. If the
signed-in org differs, the store is wiped and reseeded.

Entity models carry **no `orgId`**, and no query filters by org. The alternative —
`orgId` on every model plus a filter on every query — fails open: forget the
filter once and another org's machines render, which no single-org testing will
ever catch. Here the leak has no field to travel through. Refetching is already
assumed cheap by the mirror-by-full-refresh model.

## Main actor by exception, not by default

Xcode 26 sets `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` on new projects. The
Vendpire target overrides that to `nonisolated`, because the generated OpenAPI
client (`swift-openapi-generator` 1.14.2, which offers no isolation option)
crosses actor boundaries internally via `@Sendable` closures and will not
compile under a MainActor default at all. This wasn't chosen on the app's own
merits — a code generator forced it — and is tracked for reversal on the
shuffleboard card "Generated OpenAPI client vs. MainActor-by-default — revisit
the module boundary": moving generated code into its own module would let the
app target go back to a MainActor default without the conflict.

**Why it's safe today:** every stateful or UI-facing type already carries an
explicit `@MainActor` — `ClerkSession`, `LocalLock`, `ClientSupport`,
`MirrorWriter`, `MirrorRefresher`, `DevFixtureLoader` — `VendpireApp` and the
views inherit main-actor isolation from SwiftUI's `App` and `View`
conformances, and the app's only `ModelContext` (`container.mainContext`) is
consumed exclusively inside that annotated path. `ModelContext` is not `Sendable`; the default
changes nothing about everything that touches one staying on the main actor.

**The cost, stated plainly:** the compiler used to catch a new type that
touched `ModelContext` or a `@Model` and forgot `@MainActor`. It no longer
does — `nonisolated` is now the silent default, so that mistake compiles and
has to be caught by inspection or at runtime instead. That is a real
regression in the project's safety net, accepted because the alternative was
an app that would not build at all.

Pure logic — `SessionTokenDecoder`, everything in `Domain/` — needed an
explicit `nonisolated` under the old default and needs no annotation at all
under this one. Nothing changes for it either way.

## Divergences from the plan

- **Adds `Services/`.** The plan's tree has no orchestration layer; without one
  it lands in views.
- **`FixtureLoader` is a service, not a `Store/` utility.** That is what makes
  Phase 7 a byte-source swap instead of a rewrite — same decode, same upsert,
  same screens.
- **`AppEnvironment`, not `Environment`.** The plan's name collides with
  SwiftUI's `@Environment` property wrapper.
