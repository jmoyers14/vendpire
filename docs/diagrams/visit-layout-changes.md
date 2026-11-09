# Visit layout changes: what each one records

How to record a visit where slots were repriced, rearranged, emptied or filled
with something new. Written 2026-11-08 after entering the Nov 5 visit by hand;
the Shuffleboard "Web visit: …" cards build each change into the app.

Read `visit-calculations.md` first for the sold identity. This doc only adds
the rule for *changes*.

## How a visit actually happens

1. **Before photos.** Every row is photographed before anything is touched.
   The counts come from these: that's `remaining`.
2. **Changes.** Restock, pull expired stock, move products, change prices.
3. **After photos**, plus notes on any price changes.
4. **Entry, later, on the web.** Counts and loads from the photos, and the
   changes. The visit is back-dated to when it happened (`countedAt`).

Before/after photo counts are enough to derive every line below. Where pulled
units went only matters for expired/damaged versus everything else.

## The verbs

A visit line is **one product in one slot**, plus everything that happened to
it. Four verbs, each filling one field:

| Verb | Fills | Default when absent |
|---|---|---|
| Count n | `remaining` | (required for any product that was there) |
| Pull n *reason* | `removed`, `removedReason` | 0 |
| Load n | `added` | 0 |
| Price p | `priceCents` | last visit's price |

Every verb on the same slot and product merges into one line. A "reprice" is
not a special line: every line has a price, usually unchanged.

## Each change in verbs

Starting machine for every example: last visit left **A1 with 10 Cheetos** and
**A2 with 10 Fritos**, both $1.00; B1 empty.

| Change | Lines | Result |
|---|---|---|
| Top up | `A1 Cheetos  Count 4 · Load 6` | 6 sold at $1.00 |
| Change price | `A1 Cheetos  Count 4 · Load 6 · Price 1.25` | 6 sold at the **old** $1.00; $1.25 from today |
| Throw out expired | `A1 Cheetos  Count 4 · Pull 2 expired · Load 8` | 6 sold; 2 written off at cost |
| Put a product into an empty slot | `B1 Pretzels  Load 10 · Price 1.50` | no sales yet; next visit gives the first number |
| Remove, leave slot empty | `A1 Cheetos  Count 4 · Pull 4 destocked` | 6 sold; 4 back to the van, no loss |
| Replace | `A1 Cheetos  Count 4 · Pull 4 destocked` + `A1 Pretzels  Load 10 · Price 1.50` | Cheetos' final period: 6 sold; Pretzels start at 10 |
| Move to an empty slot | `A1 Cheetos  Count 4 · Pull 4 transferred` + `B1 Cheetos  Load 10` (4 moved + 6 new) | 6 sold; B1 starts at 10 |
| Swap | `A1 Cheetos  Count 4 · Pull 4 transferred`, `A2 Fritos  Count 7 · Pull 7 transferred`, `A2 Cheetos  Load 10`, `A1 Fritos  Load 10` | 6 Cheetos and 3 Fritos sold; both restart at 10 |
| Swap, one sold out | as above but `A2 Fritos  Count 0` | 10 Fritos sold; the `Count 0` line is what records them |
| Add a product behind | `A1 Cheetos  Count 4 · Load 2` + `A1 Pretzels  Load 4` | 6 Cheetos sold; A1 is now mixed |

## Rules that came out of entering Nov 5

- **The outgoing product always gets a line.** Recording only what went in
  leaves the old product's last period unknown (`product-changed`). A product
  that sold out still needs `Count 0`.
- **One price per slot.** The machine charges per selection, never per
  product, so every product in a mixed slot sells at the slot's price.
- **Price goes with the slot, not the product.** On Nov 5, Prographics 13↔23
  swapped Nerds and Famous Amos, and each slot's price was changed to follow
  its product. A move between slots at different prices needs that decision.
- **A mixed slot is the slot code repeated, front to back,** in the planogram
  and in the visit. Each product is counted separately (always possible from
  the photos), so each one's sales stay exact.
- **Sold out is not removed.** Green Horizons E6 Kars ended Nov 5 at 0 and is
  still a Kars slot. Only an explicit removal takes a product out of the
  planogram.
- **Moved and destocked units cost nothing at the machine.** Both are
  `returned-to-stock`; their cost lands wherever they sell. Only expired,
  damaged and recalled are a loss.
- **The planogram follows the visit.** A layout change made during a visit
  writes the next planogram version on save, both or neither, effective from
  the visit's `countedAt`. Editing the planogram separately is the exception.
- **Par is ignored** in this operation (placeholder 10). Nothing new should
  depend on it.

## Real cases from Nov 5

| Machine | Slot | What happened | Change |
|---|---|---|---|
| One Stop | A0 | 1 Wavy Lay's moved from B6 behind 1 Ruffles | move + add behind |
| One Stop | A8 | 2 Flamin Hot Cheetos loaded behind Funyuns Flamin Hot | add behind |
| One Stop | B4 | Was already mixed on Oct 29 (2 Harvest Cheddar, 2 Original behind); Harvest Cheddar sold out | sold out ≠ removed (B4 kept Original) |
| One Stop | C0 | 2 S&V moved to C2 behind BBQ; 3 Nerds moved in from F8; $1.25 → $2.00 | move + price |
| One Stop | C4 | 3 Calbee back to the van; 2 Flamin Hot Limon in at $1.50 | replace + price |
| One Stop | E9 | 3 Hershey's moved behind Mr. Goodbar in D5; 6 pistachios in, 2 each of 3 flavors, $1.00 → $2.00 | move + mixed slot + price |
| One Stop | E4 | 3 NV Biscuits behind the Reese's, missed in two counts | correction, not a change |
| Green Horizons drink | A5 | 12 Coke Zero into a slot the planogram didn't have, $1.50 | put into empty slot |
| Green Horizons snack | D10, E6 | 1 expired Kars pulled from each; E6 left empty but still Kars | pull expired |
| Prographics snack | 66→27, 76→37, 86→17 | Three pistachio flavors moved; KitKat, Hershey's Almonds and Trident (from 37) took their slots | moves |
| Prographics snack | 13↔23 | Nerds and Famous Amos swapped; prices swapped with them ($2.25 / $1.50) | swap + price |

## Ideas not yet built

- **Before/after counts as the entry format.** The operator already has both
  sets of photos; the app could take "before" and "after" per slot and derive
  the verbs, instead of asking for Load and Pull directly.
- **Planograms derived from visits.** Discussed and deferred: visits can't yet
  tell "sold out, still assigned" from "emptied on purpose", and the phone and
  API read planograms. Keeping the planogram but writing it from visits gets
  most of the benefit.
