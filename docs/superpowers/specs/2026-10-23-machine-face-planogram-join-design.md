# Machine face — the planogram join

Pulled out of Phase 2 on 2026-10-21, designed 2026-10-23. Ships **before** Phase 8.

`MachineFaceView` walks `machine.slots` and renders slot codes in grey squares. It infers
nothing, which is correct, and it means nothing, which is the problem. This card makes a cell
say what is in it and what it costs.

## Why this lands before Phase 8

Phase 8's headline ergonomic is the fill-to-par default, `added = par − remaining`. That needs
`par` per cell, which needs the `slot → planogram → product` join. The join does not exist:
`Domain/` holds `Gtin.swift` and `VisitLevels.swift`, and nothing resolves a planogram for a
machine. Phase 8 builds it either way — here it lands as a tested pure function rather than as
scaffolding inside a keypad screen.

Second reason: `National 148` is widths `[4,4,4,7,7,4]` with the code convention switching from
`A0 A2 A4 A6` to `D1…D7` partway down. Confirming that renders as authored is a glance on a
read-only grid. On a grid carrying two number pads, an override dot and auto-scroll-into-view,
it is a debugging session in which a layout bug reads as a capture bug.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Scope | **The planogram join only** | Last-visit counts, the P&L link and Start visit land in Phase 8 beside the screens they lead to. |
| Shared grid container | **No — keep the walk inline** | The web extracted `SlotFaceGrid` with three consumers in hand. iOS has one. Phase 8 extracts it against two real cells instead of one real and one imagined. |
| Shelf width | **Every shelf spans the full width; cell width is `available ÷ slotCount`** | How a cabinet is actually built, and already the web's rule — `SlotGridEditor.tsx:22`. |
| Width floor | **40pt, scroll past it** | Same rule as the web's `min-w-14`, retuned for iOS type. `$1.25` at caption2 is ~29pt, so the web's 56px floor is wrong here. |
| Cell content | **Slot code + price, uniform across shelves** | Content that changes with shelf width makes the face change shape between machines. |
| Product name and par | **Behind a shelf peek** | A 45pt cell fits a code and one number. |
| Peek target | **The shelf row itself** | `SlotFaceGrid.tsx:66` — "Shelves have no identity of their own — position IS the shelf." There is no label to hold and deriving one means parsing codes. |
| Current planogram | **Whatever the mirror holds for the machine** | The server already picked. See below. |

## The join — `Domain/MachineFace.swift`

Pure values in, pure values out. No SwiftData, no simulator, no fixture — the case
`ARCHITECTURE.md:62-65` names for this layer.

```swift
struct FaceCell: Equatable, Sendable {
    let slotCode: String
    let state: FaceCellState
    let productName: String?
    let par: Int?
    let priceCents: Int?
}

enum FaceCellState: Equatable, Sendable {
    case assigned        // planogram entry, product resolved
    case empty           // no planogram entry for this slot code
    case unknownProduct  // planogram entry, productId does not resolve
}

struct MachineFace {
    let rows: [[FaceCell]]
    init(slots: [[String]], planogramSlots: [PlanogramSlot], productNames: [String: String])
}
```

Three states, not two. A dangling `productId` is not an un-planogrammed slot: par and price are
still known, so the cell renders them and the peek reads "Unknown product" rather than going
blank. `DevFixtureLoaderTests` guards the fixture against dangling ids; the view degrades
honestly anyway.

`rows` is `slots` walked verbatim. Nothing sorts, nothing parses a code, nothing derives a width.

On `National 148`, 30 cells meet 17 planogram entries. The other 13 are `.empty` — a real
authored state, not an error.

## The store query — `Store/Model/StoredEntityQueries.swift`

```swift
extension StoredPlanogram {
    static func forMachine(_ machineId: String) -> Predicate<StoredPlanogram> {
        #Predicate { $0.machineId == machineId && $0.deletedAt == nil }
    }
}
```

**No date logic, and no clock in the query.** The mirror never holds planogram history:
`MirrorRefresher.swift:56` calls `fetchCurrentPlanograms()` → `GET /planograms/current` →
`findCurrentByOrg`, an aggregation that returns the latest `effectiveFrom` per machine, one row
each. The server has already chosen.

Filtering `effectiveFrom <= now` here would be a bug rather than a safeguard. The server resolves
current as the unconditional latest, so a future-dated version arrives as the machine's only
planogram; the phone would filter out the one row it has and render all 30 cells empty. A
machine that silently looks unstocked is the worst available failure.

That the server lets a future version go live early is a real gap, tracked on its own card
("A future-dated planogram becomes current the moment it is saved"). Fixing it in
`findCurrent*` corrects web and iOS together. Diverging on the phone would make the two
surfaces disagree about what a machine costs.

Expect zero rows or one. If more ever appear, take the highest `effectiveFrom` — the server's
rule, not a second opinion.

## The view

Keeps its own `ForEach` over `machine.slots`. Per shelf, cell width is
`(available − gaps) ÷ slotCount`, floored at 40pt, scrolling horizontally only past that floor.

`National 148` at 393pt gives 84pt cells on the 4-wide shelves and 45pt on the 7-wide, so it
renders as one equal-width rectangle with no scrolling and the whole machine on screen. A
10-wide shelf would hit the floor and scroll rather than crush to slivers.

Cell is ~56pt tall, two lines: slot code over price.

- `.assigned` — solid border, slot code over `$1.75`.
- `.empty` — dashed border on a muted fill, mirroring the web's state, with an em dash where
  the price would be. The 13 unassigned cells on `National 148` read as deliberate holes.
- `.unknownProduct` — **rendered as `.assigned`**, since par and price are genuinely known and
  the only missing fact is the name. The peek is where it reads "Unknown product". No third
  chrome: the fixture is guarded against dangling ids by `DevFixtureLoaderTests`, so a
  dedicated visual state would be built for a condition no one has seen.

**Peek:** long-press a shelf row and it expands in place into a list — full product names, par
and price — collapsing on release. Matches the capture spec's idiom (`2026-10-07-ios-visit-capture-design.md:117`)
so the gesture transfers. Worth revisiting after a real basement: the face has no keypad to
protect, so sticky-until-dismissed may beat hold.

`Domain/Money.swift` adds `priceText(cents: Int) -> String`. This is the first screen in the
app to display money. Int cents in, `$1.75` out — never `Double`, never `Decimal`.

## Tests

`MachineFaceTests` — pure, no container, no simulator:

- Ragged widths survive: `[4,4,4,7,7,4]` in, `[4,4,4,7,7,4]` out
- Order within a row survives — assert against a deliberately shuffled `planogramSlots`, so a
  sort slipping in fails the test rather than passing by luck
- An un-planogrammed slot is `.empty` at the right index, row width unchanged
- A dangling `productId` is `.unknownProduct` with par and price still populated
- Duplicate slot codes across shelves do not collide (author-legal — `SlotFaceGrid.tsx:81`)
- `Small Machine` `[2,2]` as the uniform control

`StoredEntityQueryTests` — `forMachine` returns the machine's planogram, skips soft-deleted,
and returns nothing for a machine that has none. **A machine with no planogram is reachable
today** (added via the web, not yet planogrammed) and must render every cell empty without
crashing.

`MoneyTests` — cents to display string, including zero and values above `$10.00`.

Note that every machine in the fixture has exactly one planogram, so anything that merely
*looks* right in the running app would look right whether or not the query is correct. The unit
tests are the check, not the screenshot.

Manual, per the card: `xcrun simctl launch <udid> com.dogbeach.dev.Vendpire -skipLock`, then
Right-On Studios → `National 148`, compared against `Small Machine` so a layout bug shows up as
a difference between the two rather than as something to eyeball in isolation.

## Out of scope

Last-visit counts · the P&L link · Start visit · thumbnails in cells (`ImageCache` does not
exist; tracked on the descoped-mirror-follow-ups card) · a shared grid container · any change
to the web face · the server's future-dated planogram gap.
