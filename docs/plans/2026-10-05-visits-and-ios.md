# Vendpire — iOS scaffold, the Visit domain, then integration

> **Status:** plan of record as of 2026-10-05. Stage A is committed; Stage B is expected to
> hold; **Stage C is explicitly revisable** — re-read it before starting rather than treating
> it as settled.
>
> **Amended 2026-10-05:** visit lines gained `removed` + `removedReason`. Walking
> through planogram re-organization and expired stock found a hole that invents revenue —
> units can leave a slot without being sold, and the original schema had no way to say so.
> See "Units that leave a slot without being sold" below.
>
> **Amended 2026-10-06, re-scoped 2026-10-07:** added the forced-update path. A build that
> can't be told it's too old can never be told, so the client half lands in the Phase 2
> scaffold and stays inert behind a server floor defaulting to 0. It touches Phases 2/6/7/8,
> so rather than four amendments it gets **one card of its own** plus
> `docs/diagrams/forced-update.md` for the mechanism. The phase sections below carry pointers,
> not detail.
>
> Task board: shuffleboard project `Vendpire`, nine phase tasks mirroring the phases below,
> plus one cross-cutting card ("Forced update — the version floor and the update wall").
> Subtasks prefixed `DECIDE:` mark the open questions, deliberately left to be answered at
> the phase that reaches them rather than up front.

## Context

Vendpire tracks a two-person California vending route. Phases 1–2 shipped: locations,
machines (with slot layouts), products, packs, planograms, and purchases — all behind a
tRPC API with a React dashboard for desk work.

The field half doesn't exist. Servicing a machine means counting what's left in each slot
and filling it, and none of that gets recorded anywhere. That's the gap: **sales are defined
as derived from visit counts and never stored**, so with no visits there is no revenue, no
cost of goods, no profit — purchases are the only half of the ledger that exists.

Outcome: log a visit on a phone with no signal, have it submit when signal returns, and see
derived sales and profit from it.

## How this plan is sequenced

Decisions come due when there's evidence for them, not up front. The work is ordered so each
stage is independently useful and resolves its own unknowns.

- **Stage A (Phases 1–2): foundations with no API involved.** The pure calculation engine,
  and a scaffolded iOS app with Clerk sign-in. Both standalone; either order.
- **Stage B (Phases 3–5): the Visit API and a working web interface.** A usable product.
- **Stage C (Phases 6–9): REST surface and iOS integration.** Leanings recorded, revisable.

**Phase 2 doubles as the project's biggest de-risking step.** Standing up Clerk on device
answers the one question that could invalidate the whole iOS approach — whether clerk-ios can
put an organization claim in the session token — and it answers it by building real sign-in
rather than by a throwaway spike. It also gets the face-grid UI, the hardest screen, designed
against a fixture before an API exists to argue with.

What I'd deliberately *not* do is freeze an API contract for the phone before a real visit
has gone through the system. The Visit schema will change once you use it.

## Decisions

**Settled:**

| Decision | Choice |
|---|---|
| Field workflow | **Decide at the machine** — no route planning or pick list |
| Machine selection | **Location → machine list.** `Machine.tagCode` exists but is unused |
| Commission | **Not in v1.** Get the capture UX right first |
| Cash collection | **Not in v1.** No `cashCollectedCents` field |
| Mobile platform | **Native Swift / SwiftUI**, new `ios/` at repo root, outside the Bun workspace |

**Leanings, to confirm when reached:**

| Question | Current leaning | Resolved by |
|---|---|---|
| iOS auth | **Clerk on device** | **Phase 2** — if the token carries no org claim, fall back to an `X-Vendpire-Org` header, then to device tokens |
| Swift API client | **Generated from an OpenAPI spec** over a REST surface (`/api/v1`), per `README.md:13-14`. tRPC stays web-only | Phase 6. If the Visit contract churns in real use, a hand-written client gets relatively cheaper |
| Offline model | **Mirror + outbox** — SwiftData mirror by full refresh; outbox persists drafts before any network attempt. Delta sync deferred | Phase 7. Nothing likely to change it; the data is tiny and it's forward-compatible with delta sync |

### Why mirror + outbox rather than delta sync

The conflict surface is nearly empty. Reference data is written only on web and only read on
the phone — server always wins. Visits and purchases are append-only new documents, not
edits to shared rows. So the cost of full offline-first here isn't conflict resolution, it's
**delta-sync machinery**: `findUpdatedSince` on six repositories, a sync endpoint, tombstone
retention, a persisted cursor, and client merge — where cursor semantics (clock skew, writes
landing on the high-water millisecond) stay subtly wrong for a month. At ~43 products a full
re-fetch of the entire org is a handful of calls and well under 100 KB.

Adding delta sync later swaps how the mirror fills, with no screen changes. The
`{orgId, updatedAt:-1}` indexes and `deletedAt` tombstones are already on every model.

### Does the phone need a different API than the web?

Largely no — which is what makes it safe to build the API once, for both.

**Identical:** the Visit write contract, the reads that render a face grid (machine + current
planogram + products), and the P&L read.

**Different only in cardinality.** Web is online and fetches one machine at a time on demand
(`machines.get(id)`, `planograms.getCurrent(machineId)`); the phone wants the same data in
bulk to fill its mirror. That's **additive**, and both variants are thin wrappers over
repository methods that already exist — `PlanogramRepository` has both `findCurrentByMachine`
and `findCurrentByOrg` today.

Two forward-compatibility choices, both free:

1. **`clientRequestId` is in the write contract from day one**, even though web barely needs
   it. Retrofitting means a unique-index migration on a populated collection plus a second
   code path. Web benefits anyway: it kills double-click double-posts.
2. **Services take `orgId` + optional filters**, never a "one machine" assumption, so a bulk
   variant is a router line and not a refactor.

### Verified groundwork

- **`PlanogramRepository.findCurrentByOrg(orgId)` already exists** — "the current version of
  EVERY machine," the bulk-prefetch primitive. Missing only a router procedure.
- **No procedure declares `.output()` or `.meta()`** — every response type is inferred from
  the service return value. That's the main cost of the OpenAPI route (Phase 6).
- tRPC resolves to **11.19.0** (package.jsons say `^11.8.1`), **no transformer**.
- `ClerkClient.verifySessionToken` reads `claims.org_id ?? o?.id`; `trpc.ts:43-49` throws
  `FORBIDDEN` when null, and every data procedure is `orgProtectedProcedure`.
- `Job.dedupKey` (unique compound with `jobType`) is the house idempotency pattern.
- Worktree APIs default to port **3210**, not the 3000 in `.env.example`.

---

# Core architectural rule

> **The Visit document stores only observations — counts, prices, par. Every derived number
> — sold units, revenue, COGS, profit — is computed from the ordered visit sequence at read
> time by the pure domain engine. Nothing derived is ever persisted.**

Consequences: no denormalized values to repair, no recompute job, no eventual-consistency
window, and a late Costco receipt retroactively corrects COGS exactly as `Product.ts`
already promises by refusing to store unit cost. A backdated offline visit just changes what
the next read returns. Cost: reports scan N visits — hundreds of documents a month.

### The sold identity

For a given **(slotCode, productId)** key:

```
levelAfter(visit)  = visit.remaining − visit.removed + visit.added
sold (prev → cur)  = levelAfter(prev) − cur.remaining
```

`remaining` is what was physically in the slot on arrival — **before refilling and before
pulling anything out**. Keying by (slotCode, productId) rather than slotCode alone is what
makes mixed spirals record per-flavor counts, and what lets one slot carry both its outgoing
and incoming product on a re-planogram visit.

`added` and `removed` both belong to the **previous** visit in the formula: they are
things you did at that servicing, and together they set the level the next interval draws
down from.

### Units that leave a slot without being sold

Expired stock, damage, and destocking all take units out of a slot with no revenue. Without
a dedicated field the arithmetic assumes a customer paid for them — the same family of bug
as treating a missing line as zero. There is no way to record it with counts alone: counting
before you bin expired stock gets this interval right and the next one wrong; counting after
invents revenue immediately. Either way you lose exactly the units you binned.

So each line carries `removed` and a `removedReason`, and the reason decides whether
it's a loss:

| reason | disposition | P&L effect |
|---|---|---|
| `expired`, `damaged`, `recalled` | `written-off` | cost hits profit |
| `destocked` (slow mover → van), `transferred` (→ another machine) | `returned-to-stock` | **none** |

A transfer is free, and not by convention — unit cost is an all-time, org-wide weighted
average per product, so when those units sell at another machine their COGS lands there.
Booking them at removal would double-count. `visits/removals.ts` holds the one mapping from
reason to disposition, so the engine never branches on a reason and adding one later
("stolen") is a table change rather than an arithmetic change.

Two consequences worth having:

- **A product swap becomes recoverable.** Record the outgoing product with
  `removed = remaining` alongside the incoming product's line — legal already, since a
  duplicate `slotCode` with a different `productId` is the mixed-spiral case — and the
  closing interval computes normally instead of reporting `product-changed`.
- **`levelAfter === 0` with the key absent next visit means the position closed
  deliberately** — no interval, no anomaly. Previously indistinguishable from "you forgot to
  count it." Anomalies that fire every week get ignored; these now fire only on real
  problems.

Van stock also falls out for free as a later report, with no new data:
`Σ purchased − Σ added + Σ removed(returned-to-stock)`. A negative result is a data-entry
error worth surfacing.

### Eight traps this design exists to avoid

1. **Never reject an out-of-order visit.** Offline-first makes backdating normal: you
   service at 9am with no signal, your wife services at 2pm and submits first, you sync at
   5pm. Both visits happened. Rejecting destroys real field data. Accept, log, emit
   analytics.
2. **Reference validation must be deleted-tolerant.** If the mirror has product P, someone
   soft-deletes P in the dashboard, and the outbox submits a line for P, a `findExistingIds`
   check 400s permanently and the day's counts are gone. Validate "exists as a document in
   this org", ignoring `deletedAt`. **The subtlest data-losing bug in the feature.**
3. **A missing slot line is not `remaining = 0`.** Treating it as zero books the entire
   leftover as sold and *invents revenue* — the most dangerous possible bug here. A slot
   absent from the later visit is `slot-not-counted` (no sold figure). A slot whose
   `productId` changed is `product-changed` (position closed, `unaccountedUnits` went to the
   van, no sold figure). Different states, different meanings.
4. **Interval price is the PREVIOUS visit's `priceCents`** — that's what it was selling at
   between the two visits. Easiest bug in the system to write.
5. **Round COGS once.** `sold × sumCost / sumUnits`, rounded at the end. Rounding a per-unit
   cost to cents then multiplying drifts. Export no rounded per-unit cost usable in
   arithmetic — only a display-only helper.
6. **`cogsCents` is `null` when ANY row's cost is unknown** — never the sum of the known
   ones. A partially-known COGS shown as a number is a lie that yields confidently wrong
   profit, and a fresh catalog has plenty of products with no purchase history. Same for
   sold. `unknownCostRows` lets the UI say "profit unavailable: 3 products lack purchase
   history."
7. **Units removed from a slot were not sold.** Expired, damaged, or destocked stock leaves
   via `removed`, and `removedReason` decides whether it's a write-off or a transfer.
   Omit the field and the engine books a customer purchase that never happened.
8. **Idempotency returns 200 with the original document, never 409.** A client that timed
   out can't distinguish "succeeded, response lost" from "failed"; a 409 makes the outbox
   either drop the draft or retry forever.

---

# Stage A — Foundations (no API work)

Phases 1 and 2 are fully independent of each other and of everything downstream.

## Phase 1 — Domain engine (`packages/domain`)

Test-first, pure, no I/O, no mocks. No commission module in v1; P&L is revenue − COGS.

```
src/visits/{types,removals,anomalies,sold}.ts + sold.test.ts
src/costs/unitCost.ts + unitCost.test.ts
src/pnl/pnl.ts + pnl.test.ts
src/gtin/vectors.json          # extracted from gtin.test.ts, shared with Swift in Phase 2
```
Modify `src/index.ts` to export `./visits`, `./costs`, `./pnl`. `money/` stays for money
*primitives* (`allocate`); `costs/` holds the domain costing rule. `UnknownSoldReason` lives
in `types.ts` rather than `sold.ts` so `anomalies.ts` can reference it without a cycle.

```ts
// visits/removals.ts — the ONE place the loss-vs-transfer policy lives.
export type RemovalReason =
  | "expired" | "damaged" | "recalled"   // → written-off
  | "destocked" | "transferred";         // → returned-to-stock
export type RemovalDisposition = "written-off" | "returned-to-stock";
export const dispositionFor: (reason: RemovalReason) => RemovalDisposition;
export const isWrittenOff: (reason: RemovalReason) => boolean;
```

```ts
// visits/sold.ts
export type SoldUnits =
  | { readonly status: "known"; readonly units: number }   // may be NEGATIVE
  | { readonly status: "unknown"; readonly reason: UnknownSoldReason };

export interface SlotInterval {
  readonly slotCode: string; readonly productId: string;
  readonly from: string; readonly to: string;
  readonly sold: SoldUnits;
  readonly priceCents: Cents;      // the PREVIOUS visit's line price
  readonly parAtFill: number | null;
}

/**
 * A removal is a property of a VISIT, not of an interval — it happens at the
 * boundary. Returned separately so a removal on the LAST visit isn't dropped
 * for want of a following interval.
 */
export interface SlotRemoval {
  readonly slotCode: string; readonly productId: string;
  readonly visitId: string; readonly countedAt: string;
  readonly units: number;
  readonly reason: RemovalReason | null;   // null → unknown-removal-reason
}

/** An object, not two positional visits: same type, so a swap typechecks and
 *  silently inverts the arithmetic. */
export const diffVisits: (visits: { previous: VisitObservation | null; current: VisitObservation })
  => { intervals: SlotInterval[]; anomalies: VisitAnomaly[] };

/** Sorts defensively by (countedAt, createdAt, id) — callers needn't pre-order. */
export const intervalsForMachine: (visits: readonly VisitObservation[])
  => { intervals: SlotInterval[]; removals: SlotRemoval[]; anomalies: VisitAnomaly[] };
```

```ts
// costs/unitCost.ts — weighted average is ALL-TIME per product per org in v1.
// The purchase set is a parameter, so narrowing to as-of-interval later is a caller change.
export type UnitCost =
  | { readonly status: "known"; readonly sumUnits: number; readonly sumCostCents: Cents }
  | { readonly status: "unknown"; readonly reason: "no-purchases" | "no-units" };

export const buildCostBasis: (lines: readonly CostBasisLine[]) => Map<string, UnitCost>;
/** sold × sumCost / sumUnits, Math.round ONCE at the end. */
export const cogsForUnits: (units: number, basis: UnitCost | undefined) => …;
/** FOR DISPLAY ONLY ("about $0.49 each"). Never multiply this by a count. */
export const unitCostCentsForDisplay: (basis: UnitCost) => Cents | null;
```

```ts
// pnl/pnl.ts
export interface PnlTotals {
  readonly revenueCents: Cents;
  readonly cogsCents: Cents | null;        // SOLD units only; null if ANY row unknown
  /** revenue − cogs. Operating performance, ignoring waste. */
  readonly grossProfitCents: Cents | null;
  /** Write-offs at cost: expired / damaged / recalled. */
  readonly writeOffCents: Cents | null;
  readonly writeOffUnits: number;
  /**
   * destocked / transferred. Units only, deliberately with NO cost figure —
   * the type refuses to let a transfer be added to a loss.
   */
  readonly returnedToStockUnits: number;
  /** revenue − cogs − writeOff. The honest bottom line. */
  readonly netProfitCents: Cents | null;
  readonly unknownSoldRows: number;
  readonly unknownCostRows: number;
  readonly unknownRemovalReasonRows: number;
}
/**
 * Discriminated on disposition so a returned-to-stock row has NO cost field at
 * all — not a zero, and not a nullable. There is nothing to accidentally add to
 * a loss total, which is what actually enforces PnlTotals' promise above.
 */
export type RemovalPnlRow =
  | { readonly removal: SlotRemoval; readonly disposition: "written-off";
      readonly costCents: Cents | null }        // null = unknown cost
  | { readonly removal: SlotRemoval; readonly disposition: "returned-to-stock" };

export const buildIntervalPnl: (intervals, removals, costBasis) => { rows; anomalies };
/** No anomalies come out here: nothing becomes knowable at summary time that
 *  buildIntervalPnl hasn't already reported, and the unknown*Rows counts carry
 *  what a UI needs to explain a null. */
export const buildPnlTotals: (rows: PnlRows) => PnlTotals;
```

**"P&L" here is product-level profitability, not a business P&L.** No operating
expenses exist in v1 — no fuel, labour, depreciation, and commission is explicitly cut.
So `netProfitCents` means *net of the goods you lost*, not net of running the route.
That's the question you have standing at a machine ("is this slot worth the space?"),
and it's the one visit data can answer honestly.

Worked examples with real numbers carried end to end — including a product
replacement recorded both correctly and carelessly — live in
`docs/diagrams/visit-calculations.md`.

Both profit figures are exposed because folding write-offs silently into COGS hides the one
number you'd act on, and omitting them entirely makes profit optimistic. Each null-propagates
independently, so an unknown-cost write-off can leave `netProfitCents` null while
`grossProfitCents` stays real.

```ts
// visits/anomalies.ts
export type VisitAnomaly =
  | { kind: "negative-sold"; slotCode; productId; units }
  | { kind: "no-baseline"; slotCode; productId; reason: UnknownSoldReason }
  | { kind: "product-changed"; slotCode; productId; unaccountedUnits }
  | { kind: "slot-not-counted"; slotCode; productId }
  | { kind: "over-par"; slotCode; productId; level; par }
  | { kind: "over-removed"; slotCode; productId; remaining; removed }
  | { kind: "unknown-removal-reason"; slotCode; productId; units }
  | { kind: "unknown-cost"; productId };
```
`out-of-order` stays out of the pure engine — it's about insertion, not arithmetic.

### Tests that prove it

`sold.test.ts` — single visit → all `first-visit`; prev `{rem 2, add 8}` + this `{rem 3}` →
**7**; emptied `{0,10}`→`{0}` → 10; **negative** `{0,10}`→`{12}` → `known/-2` + anomaly,
**assert no clamping**; a −2 then +14 sequence summing to the true 12 (the proof that not
clamping is correct); product swap → old `product-changed` with `unaccountedUnits: 10`, new
`first-visit`; mixed spiral (both `(A3,coke)` and `(A3,sprite)` in one visit) each diffing
against its own key; **slot omitted later → `slot-not-counted`, NO sold figure** (the
invent-revenue guard); slot first appearing at visit 3 → `first-visit` not
`product-changed`; **prev price 150 / this 175 → interval price 150**; reverse-ordered input
→ identical output; `countedAt` tie → deterministic; over-par warns but still computes;
zero-line visit mid-sequence invents nothing.

Removals — **the expiry case:** `{rem 2, add 8}` → `{rem 6, removed 3, add 7}` sells **4**,
*and* the following interval draws from 10 not 13 (counting before binning gets this interval
right and the next one wrong; counting after invents revenue immediately — the test asserts
both intervals); a swap that counts the outgoing product out (`removed = remaining`) →
a real sold figure and **no** `product-changed`; `levelAfter === 0` then key absent → position
closed, no anomaly; `removed > remaining` → `over-removed`, still computes;
`removed > 0` with a null reason → `unknown-removal-reason`.

`unitCost.test.ts` — **round-once:** units 7, sumCost 100, sumUnits 3 → `round(700/3)=233`
(naive `round(100/3)×7=231`, off by 2¢); **the identity test:** 30@1499 + 10@699, sell all 40
→ exactly 2198 (buying all of it costs what you paid; also proves weighted not arithmetic
mean); no purchases → `unknown`, **assert NOT zero** (booking zero COGS inflates profit —
the one error a vending operator can't afford); `sumUnits === 0` → `unknown/no-units`;
negative sold → negative COGS; sold 0 → known 0; pack-expanded purchase lines need zero pack
knowledge (`PurchaseServiceImpl` already expanded them).

`pnl.test.ts` — hand-computed happy path; **the honesty test:** one unknown-cost product →
`cogsCents === null`, `netProfitCents === null`, `unknownCostRows === 1`, but `revenueCents`
still real; one unknown-sold row excluded from totals; zero visits → no throw.

Write-offs — an `expired` removal reduces `netProfitCents` but **not** `grossProfitCents`;
a `destocked` removal changes neither, and contributes units with no cost figure; an
unknown-cost write-off leaves `netProfitCents` null while `grossProfitCents` stays real.

## Phase 2 — iOS scaffold, Clerk, and the face grid (no networking)

New `ios/` at repo root, outside the Bun workspace. Biome's `files.includes` is JS/TS only,
so `ios/` is invisible to lint — no config change needed.

**No API calls in this phase at all.** Screens render from a committed JSON fixture, so the
UI is fully developable with no backend running.

```
ios/Vendpire.xcodeproj
ios/Vendpire/
  VendpireApp.swift
  Config/Environment.swift            # base URL per scheme; Debug-only .xcconfig (unused yet)
  Auth/{ClerkSession,Keychain,LocalLock}.swift
  Store/Model/Stored{Location,Machine,Product,Pack,Planogram}.swift   # SwiftData @Model
  Store/FixtureLoader.swift           # seeds the store from the bundled fixture
  Domain/Gtin.swift                   # ported normalizeGtin
  Support/ClientSupport.swift         # @Observable update gate; Debug-set until Phase 7
  Features/{SignIn,LocationList,MachineList,MachineFace,UpdateRequired}/
  Fixtures/sample-org.json            # exported from local Mongo
ios/VendpireTests/
  GtinTests.swift                     # reads the SHARED vectors.json
  ClientSupportTests.swift            # build comparison + gate transitions
```

### What this phase delivers

1. **Xcode project + schemes**, Debug/Release config, a Debug-only `.xcconfig` for the base
   URL (unused until Phase 7 but established now so it never gets hardcoded).
2. **Clerk sign-in**, session persisted to Keychain.
3. **The org-claim answer.** Call `session.getToken()`, base64-decode the JWT's middle
   segment, and assert `o.id` or `org_id` is present — log it and write down the result. This
   is the gate on the whole iOS approach: `ClerkClient.verifySessionToken` reads exactly
   those claims and `orgProtectedProcedure` 403s without them, so no org claim means every
   future endpoint fails. Fallbacks, in order: an `X-Vendpire-Org` header validated against
   the webhook-fed `OrganizationMembership` collection (~30 lines of backend); then
   `auth.pairDevice` minting long-lived revocable device tokens.
   Also note whether a cold launch offline yields a session — expect `Clerk.load()` to fail,
   which is why rule 1 below exists.
4. **`LocalLock`** — biometric/passcode gate, because the store must be readable without a
   network-dependent token.
5. **SwiftData models + fixture seeding.** Location / Machine / Product / Pack / Planogram
   only — these entities already shipped and are stable, so modelling them now is safe. The
   visit-related model is deliberately absent; it depends on Phase 3.
6. **Navigation skeleton** — Location list → Machine list → machine face.
7. **The face grid**, the hardest screen, built against the fixture. Walks `machine.slots`
   exactly as stored — **never infer layout from codes** (`Machine.slots` is `[[String]]`
   precisely so grids render as authored). Each cell shows the planogram's product, par, and
   price from the fixture. No capture inputs yet; that's Phase 8.
8. **`normalizeGtin` ported to Swift**, with `GtinTests` reading the same `vectors.json`
   extracted in Phase 1 as a bundle resource — otherwise the two implementations drift the
   first time someone fixes a UPC-E edge case.
9. **The update wall** — `Support/ClientSupport.swift` (an `@Observable` gate holding
   `.none | .recommended | .required`) and `Features/UpdateRequired/UpdateRequiredView.swift`.
   No networking: the gate is set from a Debug menu here, and renders from state like every
   other screen in this phase. See below for why it lands now.

### The update wall

Deliverable 9 is the un-networked half of the forced-update path: a build that can't be told
it's too old can never be told, so the client machinery has to ship in the scaffold. It needs
no networking here — the gate is Debug-driven and the wall renders from state like every other
fixture-backed screen — so this phase's no-API-calls rule still holds.

**The mechanism end to end lives in `docs/diagrams/forced-update.md`**, and the work is
tracked on the shuffleboard card "Forced update — the version floor and the update wall",
which spans Phases 2/6/7/8. Don't duplicate the design here.

### Rules established here

- **The store is readable without auth, always.** Gate the *app* on biometric/passcode; gate
  only *network* on the token. A failed sign-in must never clear or hide the store. This is
  the single most important UX rule in the app, and building it before networking exists is
  the easiest time to get it right.
- **Money is `Int` cents everywhere.** Never `Double`, never `Decimal` for storage.
- **Port only `normalizeGtin`.** The phone never needs the P&L engine.

---

# Stage B — The Visit API and web interface

## Phase 3 — Visit persistence

Follow the `Purchase` slice exactly as the template:
`packages/platform/src/data-access/models/Purchase.ts` and
`repositories/PurchaseRepository/{types,PurchaseRepository,PurchaseRepositoryImpl}.ts`.

**Create** `models/Visit.ts` and
`repositories/VisitRepository/{types,VisitRepository,VisitRepositoryImpl}.ts` (+ a mapper
test on an exported `toVisit`, as `toCommission` is tested in `LocationRepositoryImpl.test.ts`
— no database needed).

Model fields: `orgId`, `machineId`, `locationId`, `planogramId` (null), `countedAt`,
`recordedByUserId`, `lines[]`, `notes`, `clientRequestId`, `deletedAt`, `{timestamps:true}`.
Line sub-schema (`_id: false`): `slotCode`, `productId`, `remaining`, `added`,
`removed` (default 0), `removedReason` (null), `priceCents`, `par` (null).

```
{ orgId: 1, machineId: 1, countedAt: -1 }   // engine workhorse + per-machine history
{ orgId: 1, countedAt: -1 }                 // list / period reports (house sortField convention)
{ orgId: 1, updatedAt: -1 }                 // house sync-pull convention
{ orgId: 1, clientRequestId: 1 }, { unique: true }
```

`clientRequestId` is **required** on Visit, so a plain unique index is safe. On the existing
`Purchase` collection it must be nullable, so that index needs
`partialFilterExpression: { clientRequestId: { $type: "string" } }` — a plain unique index
rejects the second null, and it will bite on the first second purchase.

Repository port:

```ts
findByOrg(orgId, filter?: { machineId?; from?; to?; limit? })
/** ASCENDING by (countedAt, createdAt, _id) — the total order the engine requires.
 *  When `from` is given, INCLUDES the last visit at or before it. */
findByMachineAscending(orgId, machineId, range?: { from?; to? })
/** Newest visit of EVERY machine — the mobile mirror's prior-counts source.
 *  Same $sort/$group/$first/$replaceRoot shape as PlanogramRepository.findCurrentByOrg. */
findLatestByOrg(orgId)
findLatestByMachine(orgId, machineId)
findById(orgId, id)
findByClientRequestId(orgId, clientRequestId)   // the idempotency read
create(orgId, data)
/** Append-only: editing a visit rewrites the NEXT visit's baseline. */
softDelete(orgId, id)
```

That `findByMachineAscending` contract matters: slice a date range naively and the first
visit in the window has no in-window predecessor, so every key reports `first-visit` and the
first interval's revenue silently becomes zero.

Also in this phase: add `clientRequestId` to `Purchase` (model, repository types, port, impl)
and the deleted-tolerant reads — `ProductRepository.findExistingIdsIncludingDeleted`, plus
`findByIdIncludingDeleted` on `MachineRepository` and `LocationRepository`.

Wire up `data-access/tokens.ts` (+`VISIT_REPOSITORY_TOKEN`), `registerServerCore.ts`, and
the `packages/platform/src/index.ts` contract barrel.

## Phase 4 — Visit service and tRPC router

```ts
// packages/api/src/routers/visits.ts
const visitLineInput = z.object({
  slotCode: z.string().min(1).max(8),
  productId: z.string().min(1),
  // BEFORE refilling AND before pulling anything out
  remaining: z.number().int().min(0).max(999),
  added: z.number().int().min(0).max(999),
  removed: z.number().int().min(0).max(999).default(0),
  removedReason: z.enum([
    "expired", "damaged", "recalled", "destocked", "transferred",
  ]).nullable().default(null),
  priceCents: z.number().int().min(0).max(100_000),
  par: z.number().int().min(0).max(999).nullable().default(null),
})
  // A reason is REQUIRED once units are removed — it decides loss vs. transfer,
  // and defaulting either way would overstate or hide the write-off.
  .refine((l) => l.removed === 0 || l.removedReason !== null, {
    message: "removedReason is required when removed > 0",
  });

const visitInput = z.object({
  machineId: z.string().min(1),
  locationId: z.string().min(1),                 // SNAPSHOT from the client
  planogramId: z.string().min(1).nullable().default(null),
  // offset:true — zod's default {offset:false} REJECTS "+00:00", which an
  // ISO8601 formatter may well emit.
  countedAt: z.string().datetime({ offset: true }),
  lines: z.array(visitLineInput).min(1).max(200),
  notes: z.string().max(2000).nullable().default(null),
  clientRequestId: z.string().min(8).max(64),    // minted at DRAFT time, stable across retries
});
```
`recordedByUserId` is deliberately absent — set server-side from `ctx.auth.userId`.

Procedures: `list`, `listLatestByOrg`, `get`, `create`, `remove`, `pnl({machineId, from?, to?})`.
No `update` — editing a visit silently rewrites the next visit's baseline. `create` returns
a plain `Visit`, keeping the house pattern. A `limit` with a sane default on `list`, no
cursors.

`VisitServiceImpl` rules:

1. Machine exists in org (**deleted-tolerant**).
2. Every `slotCode` exists on `machine.slots.flat()`.
3. Every `productId` exists in org (**deleted-tolerant**).
4. `locationId` exists in org (deleted-tolerant); log when ≠ `machine.locationId`.
5. `planogramId`, when present, exists and belongs to `machineId`; log when not current.
6. No duplicate `(slotCode, productId)` pair. **Duplicate `slotCode` with different
   `productId` is legal** — the mixed-spiral case.
7. `countedAt` > 2h in the future → `BAD_REQUEST`. A future visit poisons the predecessor
   lookup for every later real visit.
8. Idempotency: `findByClientRequestId` → return **verbatim** (no re-validation, no update);
   else create inside a try/catch on E11000 → on duplicate, re-read and return.
9. `recordedByUserId = ctx.auth.userId`.
10. Out-of-order → **accept**, log, analytics.
11. Warn-only `over-par` when `remaining + added > par` — never a rejection (you really can
    cram an extra bag in).

**Explicitly NOT a rule:** requiring each line's `(slotCode, productId)` to match a
planogram slot. A planogram has one product per slot; a visit records reality. The obvious
validation here is wrong — say so in the doc comment.

`locationId` and `planogramId` come from the client, never re-derived: the phone captured at
9am when the machine sat at X, someone moved it at 2pm, the outbox submits at 5pm, and a
server-side `machine.locationId` would stamp Y. A visit filled against a stale planogram is
a real event, not an error. Corollary that shrinks the engine enormously: since price and par
are copied onto the line, **`planogramId` is pure provenance and the engine never reads a
planogram** — its inputs are the machine's visit sequence plus the org's purchase lines.

Also add `planograms.listCurrentByOrg` wrapping the existing `findCurrentByOrg`.

Wire-up: `services/tokens.ts`, `services/index.ts`, `context.ts`, `createContext.ts`,
`router.ts`, and `analytics/events.ts` (`VISIT_CREATED` with
`{visitId, machineId, lineCount, outOfOrder, anomalyCount, latencySeconds}` — that last one,
`countedAt` → `createdAt`, tells you how long drafts sit in outboxes in the field).

## Phase 5 — Web: visit entry, history, and P&L

This is what makes Stage B a usable product. It's also how the engine gets verified with real
data, and what tells you whether the Visit schema is right before Phase 6 generates a spec
from it.

**Capture** — `/machines/$machineId/visits/new`. The face grid with two inputs per cell:
"Left in slot" and "Added". Once "Left" is entered, default "Added" to `par − remaining` —
the fill-to-par default is the ergonomics win, always overridable. Prefill "left 6 last
time" from the previous visit. Mints a `clientRequestId` at form open, so a double submit
can't double-post. Reuses `MachinePlanogramsScreen`'s cell-selection pattern.

**Label the inputs "Left in slot" and "Added", never "count".** `remaining` is pre-fill and
nothing downstream can detect a violation — enter a post-fill count and every number is
silently garbage.

**History + P&L** — `/machines/$machineId/visits`. Visit list plus per-interval sold /
revenue / COGS / profit / anomalies, face grid read-only.

Files: `packages/web/src/screens/visits/{VisitEntryScreen,MachineVisitsScreen}.tsx` plus
pure `visitRows.ts` + `visitRows.test.ts` (in the `packSplit.test.ts` style), and
`packages/web/src/apiTypes.ts` (`ApiVisit`, `ApiVisitPnl`), `router.tsx`.

**Face-grid refactor:** generalize `packages/web/src/screens/machines/SlotFacePreview.tsx`
(currently renders bare codes) to accept a per-cell render, so the planogram screen, the
history screen, and the entry screen share one grid. Its doc comment already anticipates this
("used later by planogram/visit screens").

> **Make this screen work on a phone browser.** It's the interim field product: offline is
> weak, but it works, and it gets real visit data into the system before the iOS app can
> capture anything. That data is what validates the schema the OpenAPI spec is generated
> from.

---

# Stage C — REST surface and iOS integration (revisit before starting)

Current plan of record, not a commitment. Re-read after Stage B ships and real visits exist.

## Phase 6 — REST/OpenAPI surface

Per `README.md:13-14`. tRPC stays web-only; the phone talks `/api/v1`.

Only the ~10 procedures the phone needs get exposed — not the whole router:

```
GET  /api/v1/locations           GET  /api/v1/machines
GET  /api/v1/products            GET  /api/v1/packs
GET  /api/v1/planograms/current  GET  /api/v1/visits/latest
POST /api/v1/visits              POST /api/v1/purchases
GET  /api/v1/me                  GET  /api/v1/client-support
```

**`client-support` is tracked on its own card** — see `docs/diagrams/forced-update.md` and
the "Forced update" shuffleboard card. Two things from it constrain *this* phase: it is the
only unauthenticated route on the surface, so `protect: true` can't be blanket-applied across
all ten; and the `426` backstop may not be expressible as a tRPC procedure at all, which would
push that check into the HTTP handler in `index.ts`, upstream of the router. The nine
procedures below are this phase's scope.

**Two union types dodged, deliberately.** `swift-openapi-generator` fights hardest with
`oneOf`/discriminator shapes, and both of ours drop out: the Location output schema **omits
`commission`** (cut from v1, and the phone has no use for it), and **`barcodes.resolve` is
not exposed** — the phone resolves scans locally against the stored products and packs using
the ported `normalizeGtin`, which is better offline behavior anyway. Only a code absent from
the store needs the server, and that path hits the external catalog so it requires network
regardless.

Work involved:

- `initTRPC.meta<OpenApiMeta>()` in `packages/api/src/trpc.ts`.
- `.meta({ openapi: { method, path, protect: true, tags, summary } })` plus explicit
  `.output(...)` on those nine procedures. `trpc-to-openapi` requires both, and nothing in
  the codebase has either today.
- New `packages/api/src/schemas/` with one output schema per entity, each annotated
  `const locationOutput: z.ZodType<Location> = z.object({…})` — **so a change to the entity
  type is a TypeScript error**, not a silent spec drift. This is the whole point of the
  exercise; don't skip the annotation.
- Request routing in `packages/api/src/index.ts` to mount `createOpenApiHttpHandler`
  alongside the existing `createHTTPServer`. Keep `cors` on the tRPC path only — native
  clients send no preflight.
- `packages/api/scripts/generateOpenApi.ts` → a **committed** `openapi/vendpire.yaml`, so
  the Swift build doesn't need a running server. A test asserts the committed doc matches a
  fresh generation, so an un-regenerated schema change fails CI.
- Pin `@trpc/server`/`@trpc/client` to exactly `11.19.0` for `trpc-to-openapi` peer
  compatibility.

Note: `.output()` strips unknown keys at runtime. Outputs are exact DTOs from the `toX()`
mappers, so this should be a no-op — but it's the thing to check first if a field goes
missing.

## Phase 7 — iOS networking and the mirror

`swift-openapi-generator` as a SwiftPM build plugin against `openapi/vendpire.yaml`, so
generated code isn't committed and a spec change is a compile error. It produces an
`APIProtocol` that mocks cleanly in tests. Replace Phase 2's `FixtureLoader` with a real
`MirrorRefresher` over the nine endpoints, plus `ImageCache` and `StoredLatestVisit`.

On the 60-second Clerk token TTL: it's survivable. If you have enough signal to reach the
Vendpire API you have enough to reach Clerk's, so the refresh happens in the same
connectivity window as the submit. The cost is two round trips instead of one in marginal
signal, and a session that lapses with drafts pending — which is why the outbox never drops
a draft on a 401.

- **Cold launch:** unlock → render the store immediately → kick a background refresh → show
  a staleness badge ("as of 2 days ago"). **Never show an empty state because the network
  failed.**
- **Image bytes go to the Caches directory**, keyed by a hash of the URL, with only the
  filename in the `@Model` — blobs bloat SwiftData and complicate migration. `imageUrl` is a
  remote OpenFoodFacts hotlink with no `imageUpdatedAt`, so the policy is "download once,
  keep forever, refetch if missing." Server-side image hosting is the real fix, out of scope.

### Wiring up the update wall

`ClientSupportMiddleware` belongs at the one protocol seam `ARCHITECTURE.md` already
establishes: it stamps `X-Vendpire-Client` outbound and intercepts the too-old status inbound,
so nothing above the seam learns about versioning. Tracked on the "Forced update" card;
mechanism in `docs/diagrams/forced-update.md`. `client-support` is not mirror data, so
`MirrorRefresher` still covers nine endpoints.

## Phase 8 — iOS visit capture + outbox

Add the two inputs per cell to Phase 2's face grid, plus the outbox.

- **Outbox payloads are stored as bytes, not structs.** Build the exact request body at
  draft-save time and store the `Data` plus a `schemaVersion`. If the app updates and the
  generated types change, a pending draft must still submit under the schema it was captured
  with. Re-encoding at submit time silently breaks old drafts.
- **`OutboxItem.id == clientRequestId`**, minted at draft creation. Editing a draft rewrites
  the payload and keeps the id, so a twice-edited offline draft can't double-post.
- **Failure classification** — where offline apps die:

  | Response | Treatment |
  |---|---|
  | Network / timeout / 5xx / 429 | retryable; exponential backoff + jitter, cap ~1h, infinite |
  | 401 | re-auth once, then back off. **Never drop the draft** |
  | 403 (no org) | retryable after re-auth; surface "you're not in an organization" |
  | 400 / 404 | **permanent** → `needsAttention`, listed with the server's message |
  | idempotent 200 returning an existing visit | **success** |

  **Never silently delete a draft.** That rule is what keeps a day's counts from vanishing.
- **Serial drain, oldest `countedAt` first**, stop on the first retryable failure.

## Phase 9 — iOS purchase logging + VisionKit scanner, then docs

`README.md:13-14` stays true but needs its phase numbering corrected, and the packages table
needs an `ios/` row. Add `docs/diagrams/visit-capture.md` and `docs/runbooks/stuck-outbox.md`
alongside the existing `job-recovery.md`.

---

# Verification

`bun run typecheck` · `bun run lint` · `bun run test` · `bun run test:e2e`.
`bun run test` already walks domain → platform → api → worker → web, so new tests are picked
up automatically; `packages/domain` runs `--pass-with-no-tests` today, so adding real tests
there is a strict improvement.

**Stage A**

- **Engine** → `packages/domain/src/*/*.test.ts`, pure, no mocks ever.
- **iOS scaffold** → `GtinTests` against the shared `vectors.json`. Manual checks: sign in,
  **confirm the org claim in the decoded JWT and write down the result**, force-quit and
  relaunch to confirm the fixture-backed store still renders behind the local lock, and
  confirm the face grid matches the authored `slots` layout for a machine with ragged
  shelves.

**Stage B**

- **Service rules** → `VisitServiceImpl.test.ts` against a `FakeVisitRepository` added to
  `packages/api/src/services/test-support/fakes.ts`, in the `PurchaseServiceImpl.test.ts`
  style: idempotency returns the identical doc; out-of-order accepted; **soft-deleted product
  accepted**; unknown machine rejected; slotCode not on the face rejected; future `countedAt`
  rejected; duplicate `(slotCode, productId)` rejected; duplicate `slotCode` with different
  products accepted.
- **Repository mapper** → unit-test the exported `toVisit`. No database.
- **Visit flow** → `packages/e2e/tests/visits.spec.ts` (Clerk-keyed, `requireTestUser()`
  guard). Must include: create → create again with the same `clientRequestId` → assert **one**
  visit with an identical id. **The single most valuable e2e test in this plan.**
- **Web screen logic** → `visitRows.test.ts`, pure.
- Then the real check: **log a few actual visits from a phone browser in the field.** If the
  schema is wrong, that's where you find out — before a spec is generated from it.

**Stage C**

- Committed-spec-is-current test (fresh generation vs `openapi/vendpire.yaml`).
- A REST e2e spec covering the nine endpoints, including the idempotent re-POST.
- iOS → XCTest only, no network in unit tests; mock the generated `APIProtocol`.
- **The update wall, verified before it's needed.** An untested forced-update path, discovered
  broken on the day you need it, is identical to not having one — and it's the one path whose
  trigger never occurs in normal development, so it has to be forced deliberately. The checks
  are enumerated in `docs/diagrams/forced-update.md` and tracked on the "Forced update" card.
- **Offline drill** (keep as a written manual script): sign in online → full refresh →
  airplane mode → capture 2 visits at different machines + 1 purchase → force-quit →
  relaunch (assert the store renders, assert all 3 outbox rows survive) → network on →
  assert serial drain, 3 server documents, empty outbox.
- **The idempotency proof:** airplane mode, capture a visit, toggle network on and
  force-quit mid-submit → relaunch → assert exactly **one** visit server-side.
- Local API: whatever `PORT` the worktree's `.env` sets — **these default to 3210**, not the
  3000 in `.env.example`. Simulator reaches it directly; a **physical device** needs the
  Mac's LAN IP plus `NSAllowsLocalNetworking` in the Debug `Info.plist` — *not*
  `NSAllowsArbitraryLoads`.
- Seed via `packages/api/scripts/seedSnackCatalog.ts`.

# Deferred, deliberately

Commission (none/flat/percent all out until the capture UX settles) · cash collection ·
`visits.update` · delta sync / `findUpdatedSince` · pagination cursors · `tagCode` / QR
scanning · route planning and pick lists · `barcodes.resolve` on the REST surface · porting
the calc engine to Swift · card-reader reconciliation (you can't separate cash from card
revenue, so don't build a close you can't close) · server-side product image hosting.
