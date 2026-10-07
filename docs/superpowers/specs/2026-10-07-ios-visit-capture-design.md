# iOS visit capture — UX design

> **Status:** design of record as of 2026-10-07. Scopes the capture UX only; the data
> contract is `docs/plans/2026-10-05-visits-and-ios.md` and nothing here changes it.
>
> **Amends the plan of record in two places.** Phase 8 says "add the two inputs per cell to
> Phase 2's face grid" — the inputs live in a strip above the keypad, not in the cells, which
> at 45pt can hold a slot code and one number and nothing else. Phase 2's face grid gains two
> requirements it didn't have: a cell renderer driven by per-slot capture state, and
> auto-scroll to a focused cell.

## Context

Servicing a machine means standing in front of it, counting what's left in each slot, and
filling it. The visit is the only source of sales in the system — sold units are derived from
the ordered visit sequence and never stored — so the capture screen is where revenue data
either exists or doesn't.

Two properties of that setting drive everything below. You are **one-handed**, holding a phone
with a bag of chips in the other hand. And a **missing count is not a zero**: trap 3 in the
plan of record says treating an uncounted slot as `remaining = 0` books the entire leftover as
sold and invents revenue, and nothing downstream can detect it. The UX carries that trap.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Entry surface | **Whole machine face on screen, keypad pinned below** | The face is the random-access index into your own half-finished work. Going back to fix a slot is one tap on a cell you can still see. |
| What a digit means | **Always `remaining`** ("Left in slot") | `added` has a correct default; `remaining` never does. |
| `added` default | **`par − remaining`**, computed the moment you type | The fill-to-par path becomes one digit and one tap. |
| Short fill | **Labelled toggle key** moves focus to Adding, same keypad | Two extra taps, no screen change, grid stays in view. |
| `Next` target | **The next slot in walking order, always** | One fixed meaning for the whole visit. Targeting the next *uncounted* slot makes the key teleport whenever you go back to correct something — which happens on most visits, because you learn you're short after you've moved on. |
| End of the face | `Next` **relabels to "Next gap"** and jumps to the first uncounted slot; becomes "Review" when none remain | Keeps the rolling loop, each lap shorter than the last, and the one place the key changes meaning says so on its face. |
| Reaching Review | **Always available in the nav bar** | A slot can be genuinely uncountable — jammed, blocked, out of reach. Trapping someone behind a count they can't make is worse than letting them submit a gap they've seen. The gap list is the gate, not the button's absence. |
| Product recognition | **Slot code + count in the cell; hold a shelf label to peek full names** | Thumbnails are better still but depend on the Phase 7 `ImageCache`, and they're purely additive. |
| Oversized faces | **Cells never below 44pt; the grid scrolls in whichever axis overflows; the focused cell auto-scrolls into view** | `machine.slots` is ragged and arbitrary-width. 6×8 happens to need no scroll; the rule can't assume that. |
| Detail view | **Half sheet**, not a push | The grid stays partly visible, so the exception path never costs you your place. |

## Screens

**Machine face (read-only)** — the Phase 2 screen: current planogram, last visit's counts, a
P&L link, and **Start visit**.

**Visit capture** — grid, context strip, keypad. Owns a `VisitDraft` and its
`clientRequestId`.

**Slot detail** — half sheet, reached by **More** on the context strip or a long press on a
cell. Holds the exception fields.

**Review & submit** — the gate.

Capture is a separate screen from the read-only face rather than a mode on it. It owns a
draft, a keypad, and a resumable lifecycle, and mixing those into the browse screen invites
accidental entry.

## The draft

`VisitDraft` is a SwiftData model written the instant **Start visit** is tapped, with
`clientRequestId` minted there. On submit it encodes to payload bytes and becomes an
`OutboxItem` carrying that same id, so Phase 8's "edit a draft, keep the id" rule holds across
the whole lifecycle and two taps on Submit cannot double-post.

Snapshotted from the mirror at draft creation, never re-derived at submit:

- `locationId` from the machine record — the machine may be moved between counting and syncing.
- `planogramId` from the current planogram, pure provenance.
- Per-slot `productId`, `priceCents`, and `par` from that planogram.

`countedAt` is stamped at **draft creation**. That is when the observations were made, and it
is what makes the plan's `countedAt → createdAt` latency metric mean anything. One open draft
per machine; returning to the machine resumes it. A draft more than 12 hours old at submit
time surfaces `countedAt` at the top of Review with an editable date and a required
acknowledgement tap, rather than silently filing a stale observation time.

## Slot state

Two data states, three renderings.

| Rendering | Cell | Line emitted |
|---|---|---|
| **Not counted** | dim, a centred dot | **none** |
| **Counted** | green, the number, including `0` | `remaining` set |
| **Counted, left empty** | amber, `0` | `remaining: 0, added: 0` |

A dot and a `0` have to be unmistakable from arm's length, because the difference between them
is "no sales figure for this interval" versus "the whole slot booked as sold."

The third rendering is not a third data state — it is a counted line whose level after fill is
zero, which the plan already reads as a position closed deliberately. Review's "mark as empty"
action writes `remaining: 0, added: 0`; it does **not** write a removal. A removal is only for
units that physically left the slot.

## The capture screen

**Grid** — walks `machine.slots` exactly as authored, one row per shelf. Never infer layout
from slot codes.

**Context strip**, above the keypad: the focused slot's code and full product name, a **More**
disclosure, and the two fields — `LEFT IN SLOT` and `ADDING` — with the focused one ringed.
Each carries a subtitle: last visit's count under Left, and `fills to par 10` / `8 of par 10 —
short` under Adding.

**Keypad** — 0–9, a toggle key, and `Next`. The toggle shows the *other* field and its current
value (`ADDING 4` when Left has focus, `‹ LEFT 6` when Adding does), so the default is legible
without reading the strip. `0` in Adding means "couldn't fill it at all" — no separate key.

**Hold a shelf label** and that shelf expands in place into a list — full product names, both
numbers, same keypad — until you let go. This is the only way to read a product name for a slot
that isn't focused.

Nothing is ever pre-filled. A cell with no digit typed must stay distinguishable from a real
zero.

When a slot has no par, `Adding` has no default: the field stays empty and must be typed. An
empty Adding on a counted slot submits as `added: 0`, which is a real observation — you counted
the slot and put nothing in it.

A cell whose `added` differs from `par − remaining` gets an amber corner dot, so overridden
defaults are visible across the whole face.

## `Next` and the capture order

The order is `machine.slots` flattened shelf by shelf in stored order. The cycle is over
`(slotCode, productId)` keys, not bare slot codes, so a mixed spiral visits both products.
Normally one key per cell; a second key only appears when you add one.

`Next` resolves to a destination, and the key's label is derived from that destination rather
than held as separate state:

1. The slot after the focused one, if there is one.
2. Otherwise the first uncounted key — label becomes **Next gap ›**, progress bar turns amber.
3. Otherwise **Review ›**, in green.

The nav-bar Review and case 3 are the same destination; the key only ever *offers* it earlier
than the nav bar already does.

## The detail sheet

`removed` and `removedReason` (a reason is required once `removed > 0`, matching the router's
`refine`), a price override, a par override.

Visit-level `notes` lives on Review, not here.

**Deferred: the product-swap flow.** The data model supports it well — record the outgoing
product with `removed = remaining` alongside the incoming product's line — but the UI needs an
on-device product picker with search, which is real work for a rare event. Destocking is
covered by `removed` + reason today. Worth naming, because recoverable swaps are one of the
two wins the removals design bought.

## Catching a miscount at the machine

The mirror holds the previous visit, so the phone can compute the level we left the slot at and
compare it to what was just typed. Enter 9 when only 7 could have been there and the cell turns
amber with *"more than last fill — recount?"*.

**Warn only, never blocking.** Negative sold is legal and the engine must not clamp. But
catching it while you are standing there able to recount is worth far more than finding it in a
report next week.

This is one subtraction, not the P&L engine — the phone still never computes sold, revenue, or
cost. Free against the Phase 2 fixture; real once Phase 7's `StoredLatestVisit` lands.

## Review & submit

Gaps are listed **individually**, each with the slot code, product name, last visit's count,
and a one-tap way back — not summarised as "incomplete." The warning names the consequence in
domain language: *"these slots will have no sales figure for this interval — the gap won't be
treated as zero, but you also won't know what sold."*

Below that, warn-only sections: suspicious counts, over-par fills, and pulled stock. Everything
records exactly as entered.

Then notes, then **Submit**, which encodes the payload, enqueues an `OutboxItem`, and returns.
It never blocks on connectivity. The machine face then shows "submitted, waiting to sync" until
the outbox drains.

## Pure types

All of this is pure, synchronous, and testable without SwiftData or a network.

```swift
struct SlotKey: Hashable {
    let slotCode: String
    let productId: String
}

enum NextDestination {
    case slot(SlotKey)
    case review
}

/// The order `Next` walks, built from `machine.slots` exactly as authored.
struct CaptureOrder {
    let keys: [SlotKey]
    /// The key beside `key`; nil at the end of the face.
    func slotAfter(_ key: SlotKey) -> SlotKey?
    /// Mixed spirals: the incoming product lands directly after the outgoing one.
    func inserting(_ key: SlotKey, after sibling: SlotKey) -> CaptureOrder
}

struct CaptureCursor {
    let order: CaptureOrder
    let counted: Set<SlotKey>
    let focus: SlotKey
    /// O(n) in the number of slots.
    var firstUncountedSlot: SlotKey? { get }
    /// What `Next` does, and therefore what its label reads.
    var nextDestination: NextDestination { get }
}

/// `par − remaining`, floored at zero. nil when the slot has no par.
func unitsToFillPar(remaining: Int, par: Int?) -> Int?

/// The level we left this slot at last visit: the most that could be in it now.
/// One subtraction — the phone never computes sold. Takes plain counts rather
/// than a stored line so the check has no SwiftData dependency.
func levelAfterLastVisit(remaining: Int, removed: Int, added: Int) -> Int
```

## Tests

XCTest, no network, no SwiftData:

- `CaptureOrder` over a **ragged** `slots` fixture — order matches the authored layout exactly,
  and does not match what letter-prefix inference would produce.
- `slotAfter` returns nil at the last key, and is unaffected by which keys are counted.
- `nextDestination`: mid-face → the next slot even when it's already counted (the whole point
  of linear); at the last key with gaps → `.slot(firstUncounted)`; at the last key with none →
  `.review`.
- **The revisit case:** focus on an already-counted key in the middle of shelf A with gaps on
  shelves B and C → `Next` is the key beside it, not a gap.
- `firstUncountedSlot` honours authored order, not slot-code sort order.
- `inserting(_:after:)` puts the incoming product immediately after the outgoing one.
- `unitsToFillPar`: over-par remaining floors to 0; nil par returns nil (never 0 — they are
  different facts).
- `levelAfterLastVisit` matches the plan's `remaining − removed + added` on the expiry case.
- Draft → payload: only counted keys emit lines; an uncounted key emits **no line at all**.
  This is the trap-3 regression test and the most valuable test here.
- `clientRequestId` survives an edit-and-resubmit of the same draft.

Manual, in the field: log a real visit on a real machine, including one short fill corrected
after moving on, and one slot deliberately left uncounted.

## Out of scope

Barcode scanning in capture (Phase 9) · the product-swap picker · commission · cash collection
· thumbnails in cells (additive once `ImageCache` exists) · any change to the Phase 5 web
capture screen.
