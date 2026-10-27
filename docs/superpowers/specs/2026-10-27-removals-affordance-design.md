# The removals affordance

Recording units that left a slot without being sold, and why. The last gap in
Phase 8's data model: `removed` and `removedReason` are carried end to end —
draft, payload, server schema, P&L engine — and nothing in the field can produce
them.

## What this is not

**Not re-organising a machine.** Changing which product lives in a slot is a
planogram edit: a new planogram version authored on the web, with its own
`effectiveFrom`. The phone never edits a planogram, and this flow must not read
as the way to do it.

A removal is narrower: *units physically left this slot, and nobody bought
them.* The slot keeps its product.

The adjacent case — swapping the product in a slot mid-visit — is the deferred
product-swap flow. The data model already supports it (record the outgoing
product with `removed = remaining` beside the incoming product's line) but the
UI needs an on-device product picker with search, which is real work for a rare
event. Out of scope here, as it is in the capture spec.

## Why it matters more than it looks

A removal is not primarily about capturing waste. It is about **not inventing a
sale**.

Sold units are derived, never recorded:

```
levelAfter = remaining − removed + added
sold       = levelAfter(previous visit) − remaining(this visit)
```

So an unrecorded removal inflates `levelAfter`, and the *next* interval measures
down from a level the slot never held. Worked through on a real scenario — pull
two expired bars from a $1.75 slot costing $0.80 and fail to record it:

| | Revenue | COGS | Gross | Write-off | Net |
|---|---|---|---|---|---|
| recorded | $31.50 | $14.40 | $17.10 | $1.60 | **$15.50** |
| not recorded | $35.00 | $16.00 | $19.00 | — | **$19.00** |

Net overstated by **$3.50**, not the $1.60 of the loss. The two units get costed
either way — as COGS if they look sold, as a write-off if recorded — and those
cancel exactly. What does not cancel is two sales that never happened.

That is the error that survives longest, because nothing downstream contradicts
a machine that appears to sell well.

Ledger walkthrough: <https://claude.ai/code/artifact/3cbb2fce-7302-424d-8076-91e4c685d154>

## The reason is a money decision

`dispositionFor` splits the five reasons two ways:

- **written off** — `expired`, `damaged`, `recalled`. Costed, subtracted from net.
- **returned to stock** — `destocked`, `transferred`. Units only, with *no cost
  field at all*, because unit cost is an org-wide average and charging a
  transfer both here and where it finally sells would double-count.

So choosing "destocked" when you meant "expired" does not mislabel a row. It
removes a real loss from the books. The picker groups by disposition and names
the consequence, rather than listing five words.

## Entry point

A third control on the context strip, after LEFT and ADDING:

```
Big Texas Cinnamon Roll                   3/17
[ LEFT  5 ]   [ ADDING  7 ]   [ Pulled? ]
```

Reads `Pulled 2` once a removal exists, so the state is visible without opening
anything.

**Inert until the slot is counted**, with the hint "Count the slot first". Two
reasons:

- The schema defines `remaining` as "what was physically in the slot on arrival,
  **before refilling and before removing anything**". Counting first is the
  order the data requires.
- `makeSubmission` drops any line whose `remaining` is nil. A removal recorded
  on an uncounted slot would vanish at submit with no error — the same shape of
  silent loss as trap 3.

## The sheet

A half-sheet, so the grid stays visible and the operator does not lose their
place.

```
┌─ Pulled from A0 ───────────────────────┐
│  Big Texas Cinnamon Roll               │
│                                        │
│  How many?        [ − ]  2  [ + ]      │
│                   of the 5 you found   │
│                                        │
│  WRITTEN OFF — you paid, nobody will   │
│    ( Expired ) ( Damaged ) ( Recalled )│
│                                        │
│  BACK TO THE VAN — still your stock    │
│    ( Destocked ) ( Transferred )       │
│                                        │
│              [ Cancel ]  [ Done ]      │
└────────────────────────────────────────┘
```

**A stepper, not a keypad.** Removals are ones and twos, the main keypad is
behind the sheet, and a stepper enforces the bound directly.

**Capped at `remaining`.** You cannot pull more than you found. The server does
not check this — `visits.ts` bounds `removed` only by `0...999` — so an unbounded
entry would be accepted and book a negative level.

**Done is disabled until a reason is chosen** when the count is above zero. The
router's `refine` rejects that combination, and catching it here beats a 400
discovered after a drain.

Setting the count back to zero clears the reason, matching the same rule from the
other side.

## The arithmetic fix

`unitsToFillPar(remaining:par:)` becomes `unitsToFillPar(remaining:removed:par:)`,
returning `par − remaining + removed` floored at zero.

Because `levelAfter = remaining − removed + added`, ending at par requires
`added = par − remaining + removed`. The current function under-fills by exactly
the number pulled: take two out and the machine goes back two short, with a
default that looked right.

Recomputed when the removal changes, as it already is on every LEFT keystroke.

## Where it lives

| | |
|---|---|
| `Domain/CaptureOrder.swift` | `unitsToFillPar` gains `removed`; a `cappedRemoval` helper for the bound |
| `Domain/` | `RemovalReason` as a Swift type with its disposition grouping, mirroring `domain/src/visits/removals.ts` |
| `VisitCaptureModel` | sheet presentation state, the counted-first rule, applying a removal |
| `Features/VisitCapture/RemovalSheet.swift` | the sheet, taking plain values |

`DraftLine` already carries `removed` and `removedReason`; no model change.

## Tests

Domain, pure:

- `unitsToFillPar` with a removal fills to par rather than short — the regression
  this spec exists to prevent
- A removal larger than `remaining` caps rather than booking a negative level
- Each reason maps to the disposition its server counterpart does, so the two
  codebases cannot drift on which reasons are losses

Model:

- The button is inert until the slot is counted, live after
- Applying a removal recomputes ADDING to fill to par
- Clearing LEFT clears the removal with it — a removal without a count is the
  silent-loss case
- A count above zero with no reason cannot be committed
- Setting the count to zero clears the reason

## Out of scope

The price override and par override, which share the sheet in the capture spec ·
the product-swap picker · the Review screen's pulled-stock section, which belongs
with Review · any planogram editing.
