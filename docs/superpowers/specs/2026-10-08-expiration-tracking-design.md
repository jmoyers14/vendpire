# Expiration date tracking

> **Status:** design of record as of 2026-10-08. Supersedes nothing; additive to
> the Visit contract shipped in #10 (`web-visit-entry`).

## Goal

**Nothing past its date is ever sold out of a machine.**

That is the whole requirement, and it is deliberately narrower than it sounds.
Everything below is scoped to it.

## Non-goals

Each of these was considered and cut. They are listed so they are not
re-introduced by accident.

| Not doing | Why |
|---|---|
| Spoilage economics (which products/machines lose the most to expiry) | Already derivable — `removedReason: "expired"` maps to `written-off` in `removals.ts`, so the P&L books it today. A report over that data is a separate, later ask |
| Van / storage inventory with dates | Backstock ageing at home is a different problem; the stated goal is about what a customer can buy |
| FIFO rotation discipline | A practice, not a feature. Coils already enforce it physically — you load from the back |
| Lot-level cost accounting | Unit cost is an all-time org-wide weighted average by design (`Product.ts`). Lot costing would contradict that for no gain here |

## The shape of the solution

One date per slot, recorded when the slot is counted, meaning:

> **the date on the unit that will sell next — the front one.**

That definition is doing real work, so it gets stated three times (schema
comment, domain type, form hint). The front unit is both the **oldest** unit in
the slot (coils load from the back) and the **only** unit physically readable
without unloading the slot. The date that matters is the date you can reach.

### Why one date and not a lot list

Two richer designs were worked through and rejected for now:

1. **Anchor/threshold staleness detection.** Carry the date forward and compute,
   from cumulative sold units, whether every unit present when the date was read
   has since sold — flagging the date stale when so. Correct, and derivable with
   no extra stored state, but it took three attempts to explain and the operator
   standing at the slot is a cheaper and more reliable staleness check.
2. **Dated add-lines** (`added: [{units, bestBy}]`), optionally with a
   `countedLots` override. Better ergonomics — dates read off cases in daylight,
   two or three per route day, instead of off bags inside dim machines — and it
   yields per-date unit counts.

Neither was built because **per-date unit counts change no decision**: "the
oldest unit in B3 is dated Oct 12" is already sufficient, since you open the
slot and pull everything past date regardless of whether it is three units or
five. Design 2 also reshapes `added` from a number to a list, which is
load-bearing in `levelAfter` (`sold.ts:58`) and therefore in every revenue and
COGS figure, before anyone has typed a single date into any version.

**Revisit trigger:** after real route days, if reading a bag per slot proves
annoying enough to skip, build dated add-lines. It is a strictly additive
upgrade — `added` becomes a list, the single date becomes derived, and the
report's shape does not change.

## Decisions

| Decision | Choice |
|---|---|
| Capture point | At the machine, on the slot row being counted |
| Granularity | One date per `(slotCode, productId)` line |
| Meaning | The front (next-to-sell, oldest) unit's date |
| Stored type | `"YYYY-MM-DD"` string, not a `Date` |
| Pre-fill | Previous visit's line for the same key; operator overwrites |
| Staleness detection | None. The operator is looking at the slot |
| Required? | No. `null` means "no date on file", surfaced by the report |
| Per-product opt-out | `Product.tracksExpiration`, default `true` |
| Warning window | 14 days, fixed for now |

## Data model

```ts
// visitLineSchema — packages/platform/src/data-access/models/Visit.ts
/**
 * The date on the unit that SELLS NEXT — the front one, which is both the
 * oldest in the slot (coils load from the back) and the only one readable
 * without unloading. A calendar date, never an instant.
 *
 * Null means NO DATE WAS RECORDED, never "does not expire". The distinction is
 * what `Product.tracksExpiration` exists to carry, and what keeps an empty
 * expiry report from reading as "nothing is expiring" when it means "nobody
 * typed anything".
 */
bestBy: { type: String, default: null },

// productSchema — packages/platform/src/data-access/models/Product.ts
/**
 * Whether slot lines for this product are expected to carry a `bestBy`. False
 * for gum, bulk candy, and non-food — things with no useful printed date.
 * Policy lives here so the engine never branches on a product category.
 */
tracksExpiration: { type: Boolean, required: true, default: true },
```

### Why a string and not a Date

"Best by Dec 15" has no time and no zone. Stored as an instant it acquires
both, and a visit captured on a phone at UTC−8 then read by a server
formatting in UTC reports the day before. A `"YYYY-MM-DD"` string has exactly
the precision the fact has, and — because the spelling is zero-padded and
big-endian — lexicographic order is chronological order, which is what the
report sorts and filters on. No parsing in the hot path.

## Domain — `packages/domain/src/visits/expiration.ts`

New module, new `VisitLine` field, nothing else in the engine changes.

```ts
/** A calendar date, "YYYY-MM-DD". See the schema comment for why not a Date. */
export type CalendarDate = string;

export interface SlotExpiration {
  readonly slotCode: string;
  readonly productId: string;
  /** Null when no date was recorded. The service buckets those separately. */
  readonly bestBy: CalendarDate | null;
  /** What is in the slot now — `levelAfter(line)`, not `remaining`. */
  readonly units: number;
}

/**
 * Every STOCKED slot from one visit, dated or not. Only the LATEST visit per
 * machine is ever passed: a date is a standing fact about the slot's contents,
 * so the most recent observation is the whole answer and the sequence is
 * irrelevant.
 *
 * Excludes `levelAfter === 0` only — nothing in the slot, nothing to expire.
 * Undated rows are RETURNED, not filtered: they are the sole source for the
 * report's `missingDates` bucket, and dropping them here is what would make an
 * empty report read as "all clear". Deciding whether a null matters needs
 * `Product.tracksExpiration`, which is product data the engine does not take —
 * so that judgement belongs to the service, not here.
 */
export const expirationsForVisit = (visit: VisitObservation): SlotExpiration[]

/**
 * Fixed to UTC. Local-zone arithmetic shifts a best-by date by a day across a
 * DST boundary, which is a silent off-by-one in a safety report.
 */
export const dateAfter = (date: CalendarDate, days: number): CalendarDate

/** Negative when already expired. */
export const daysUntil = (bestBy: CalendarDate, asOf: CalendarDate): number
```

`VisitLine` (`packages/domain/src/visits/types.ts`) gains:

```ts
/** The front unit's date, or null when none was recorded. */
readonly bestBy: CalendarDate | null;
```

**`levelAfter`, `diffVisits`, `observationsForVisit`, `intervalsForMachine`,
`unitCost`, and `pnl` are untouched.** Expiration is strictly additive: no
revenue, COGS, write-off or profit figure reads `bestBy`. This is the single
most important property of the design.

## API — `visits.expiringSoon`

```ts
interface ExpiringSlot {
  machineId: string;
  machineName: string;
  locationId: string;
  locationName: string;
  slotCode: string;
  productId: string;
  productName: string;
  units: number;
  bestBy: CalendarDate | null;   // null only in `missingDates`
  daysUntil: number | null;      // negative = expired; null = no date on file
}

interface ExpiringReport {
  asOf: CalendarDate;
  withinDays: number;
  /** `bestBy` before today. Pull these. */
  expired: ExpiringSlot[];
  /** today ≤ bestBy ≤ today + withinDays. Load replacements. */
  expiringSoon: ExpiringSlot[];
  /**
   * Stocked slots on expiration-tracked products with no date on file. The
   * report's own honesty check: without this bucket an empty `expired` list is
   * indistinguishable from nobody having recorded anything.
   */
  missingDates: ExpiringSlot[];
}
```

`visits.expiringSoon({ withinDays: z.number().int().min(0).max(365).default(14) })`,
on `orgProtectedProcedure`, served by `VisitService.expiringSoon`.

Built from the existing `listLatestByOrg` (the newest visit per machine) joined
to products, machines and locations. No new repository method and no new index —
`{orgId, machineId, countedAt:-1}` already serves it.

Products resolved **deleted-tolerantly**, matching `VisitServiceImpl.validate`:
a retired product still sitting in a machine is exactly the stock most likely to
expire, and dropping its row would hide it.

## Form — `VisitEntryScreen` / `visitRows.ts`

The pre-fill mechanism this needs already exists. `buildVisitRows` looks up the
previous visit's line per `(slotCode, productId)` and carries `previousLevel`
forward; `bestBy` rides the same lookup.

```ts
// VisitRow
/**
 * The front unit's date. `""` means NOT RECORDED and is sent as null — never
 * defaulted to a date, for the same reason `left: ""` is never coerced to 0.
 */
readonly bestBy: string;
/** Last visit's date for this slot, for the hint. Null with no history. */
readonly previousBestBy: string | null;
/** From the product. False hides the field entirely. */
readonly tracksExpiration: boolean;
```

- `buildVisitRows` pre-fills `bestBy: previous?.bestBy ?? ""` and
  `previousBestBy: previous?.bestBy ?? null`, beside the existing
  `previousLevel`. It needs `tracksExpiration` per product; passed in as
  plain data so the module stays independent of the wire, as its comment requires.
- `rowWithBestBy(row, bestBy)`, alongside `rowWithAdded` / `rowWithRemoved`.
  No `isEdited` latch — unlike `added`, nothing recomputes this, so there is no
  default to retire.
- `buildVisitLines` rejects a malformed date with the established
  slot-prefixed message: `` `Slot ${row.slotCode}: "Best by" must be a date like 2026-12-15` ``.
  A blank is **not** an error — it sends `null`.
- `warningsFor(row, { asOf })` gains `"expired"` and `"expiring-soon"`. Both
  non-blocking, consistent with `over-par` / `over-removed`: the engine records
  what happened in the field and reports oddities rather than rejecting them.
  The options-object argument follows the TypeScript naming rules — `asOf` is
  configuration, so it is labelled rather than positional. Three call sites move
  with the signature: `VisitEntryScreen.tsx:200` (the face cell) and `:398` (the
  detail panel), plus `visitRows.test.ts`.

### Layout

A third field below the existing `Left in slot` / `Added` grid, with a hint in
the same style as `Filled to 10 last visit`:

```
┌──────────────────┬──────────────────┐
│ Left in slot     │ Added            │
│ [  5 ]           │ [  5 ]           │
│ Filled to 10 …   │ Fill to par 10   │
└──────────────────┴──────────────────┘
  Best by
  [ 2026-12-15 ]
  Last visit: Dec 15
```

Hidden entirely when `tracksExpiration` is false. Labelled **"Best by"** and
never "Expires" — the printed date on most vending stock is a quality date, and
the label should match what the operator is reading off the bag.

The warning also reaches the machine face, so it is visible **before** the slot
is tapped — while the operator is deciding whether to open it at all.
`SlotFaceGrid` owns all chrome and takes cell content and state from its
consumer, so this is a change to `VisitEntryScreen`'s `renderCell` and not to
the grid: an expiring or expired slot returns `state: "attention"` (the existing
amber status), with the detail in the cell's `title`. The existing `over-par` /
`over-removed` warnings already drive that state at `VisitEntryScreen.tsx:200`,
so expiry joins a path that is already there.

## Product form

A `tracksExpiration` checkbox on `ProductFormScreen`, default checked, in the
`products.create` / `products.update` input.

## Report UI

A dashboard card on `DashboardScreen`, grouped by location then machine:

```
Expiring soon                                      next 14 days

  Harbor Office — Combo #1
    C1  Blueberry Muffin     1 unit    EXPIRED Oct 6   ⚠
    B3  Welch's Fruit Snacks 2 units   Oct 11 · 3 days ⚠

  Westside Gym — Snack #2
    D1  Pop-Tarts S'mores    8 units   Oct 18 · 10 days

  3 slots · no date on file for 2 slots
```

The trailing "no date on file" line links to the `missingDates` rows. It is
always rendered when non-empty, including when `expired` and `expiringSoon` are
both empty — that combination is precisely the one that would otherwise read as
"all clear".

## Failure modes, and which way each fails

| Situation | Behaviour |
|---|---|
| Date never recorded | Row lands in `missingDates`. Never treated as "fresh" |
| Pre-filled date is stale (old stock sold through, nobody re-read) | Reports a date **earlier** than reality — a false alarm. You check, find it fine, overwrite. Over-cautious, never under-cautious |
| Slot not counted on a visit | No line, so no date update; the last recorded date stands and keeps warning. Correct — an uncounted slow slot is exactly where food goes bad |
| Product retired but still stocked | Included, deleted-tolerantly |
| Malformed date typed | Rejected at the form and at zod. Never stored |
| `tracksExpiration` false | No field, no report row, no `missingDates` entry |

Every degradation is toward warning about stock that turns out to be fine.
Nothing reports a slot as clear when it is not.

## Validation

- **zod** (`routers/visits.ts`): `bestBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null)`.
  Rejects `"Dec 15"`, `"2026-12-15T00:00:00Z"`, `"2026-13-01"`.
- **No "required when tracked" refine.** zod cannot see the product, and
  `VisitServiceImpl.validate` loads product **ids** only
  (`findExistingIdsIncludingDeleted`). Adding a repository method to enforce it
  server-side is not worth it when the operator at the slot is the real
  enforcement and `missingDates` is the safety net. Consistent with the engine's
  refusal to discard a real count for looking odd.

## Testing

**`packages/domain`** — `visits/expiration.test.ts`
- `dateAfter` across a month end, a leap day, a year end, and a US DST boundary
- `expirationsForVisit` excludes `levelAfter === 0`, and RETAINS undated
  stocked slots (the `missingDates` source)
- `units` is `levelAfter`, not `remaining` (found 5, binned 2, added 5 → 8)
- `daysUntil` negative when expired, zero on the day

**`packages/api`** — `VisitService.expiringSoon`
- bucketing into `expired` / `expiringSoon` / `missingDates`
- `withinDays` boundary inclusive on both ends
- several machines, grouped and ordered by `bestBy` ascending
- a soft-deleted product still appears
- `tracksExpiration: false` produces no row in any bucket
- an org with visits but no dates returns empty lists and a populated `missingDates`

**zod** — the three format rejections above; blank → `null`

**`packages/platform`** — `bestBy` round-trips through `VisitRepositoryImpl`
(the mapping at `VisitRepositoryImpl.ts:230` is the one existing line that moves)

**`packages/web`** — `visitRows.test.ts`
- pre-fill carries the previous visit's date for the matching key, and nothing
  for an unmatched one
- `""` submits as `null`; a malformed date returns the slot-prefixed error
- `warningsFor` flags expired and expiring-soon at the window edges
- a `tracksExpiration: false` row produces no warning and no date

**`packages/e2e`** — record a visit with a date, see the slot in the dashboard card

## Migration

- `bestBy` is nullable with no default beyond `null`. Existing visits need no
  backfill; they land in `missingDates` until next counted, which is accurate.
- `tracksExpiration` is `required: true, default: true`, so existing products
  need a backfill. One script following
  `packages/api/scripts/backfillPurchaseClientRequestIds.ts`:
  `updateMany({ tracksExpiration: { $exists: false } }, { $set: { tracksExpiration: true } })`.

## Out of scope for this change

- iOS. `Store/Model/StoredEntities.swift` mirrors visits but there is no fill
  screen yet; `bestBy` joins the mirror when that screen is built, and the
  contract defined here is what it will target.
- A configurable per-org warning window. Fixed at 14 days until there is a
  reason to move it.
