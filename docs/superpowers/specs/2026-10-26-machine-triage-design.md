# Machine triage, and retiring the browse screen

Prerequisite for the capture spec. It settles where **Start visit** lives, which was the
one thing blocking it.

## What this reverses

`fc0c78f` shipped a read-only machine face: slot code and price per cell, product and par
behind a shelf peek. On seeing it the verdict was *"I'm not sure what the purpose of this
screen is. Just seeing the layout and the prices doesn't really help much."*

The diagnosis in that card was that the screen showed the wrong facts, and that the
operator-relevant ones (last visit's counts, P&L, Start visit) had been scoped to Phase 8.
That diagnosis was wrong, and better content would not have fixed it.

The screen's real job is **triage** — deciding whether a machine is worth opening. Triage is
*comparative*: you are choosing between the machines at a location, and you cannot compare
one screen at a time. **A per-machine screen is the wrong shape for that decision**, whatever
it contains. So the facts move to the list, and the screen goes.

## What the phone can honestly know

Offline, from the mirror:

| Known | Not known |
|---|---|
| When it was last serviced (`countedAt`) | Current stock — needs sales since |
| What we **left** per slot (`remaining + added − removed`) | Revenue or profit — the phone never computes sold |
| Product, par and price per slot | Who serviced it — `recordedByUserId` is not mirrored |

"How full is it right now" is unanswerable here and stays unanswered. The server is the only
thing that could estimate it, since it holds the visit history and the P&L engine. That is
tracked as a later additive field rather than built now.

## The row

```
Right-On Studios

  National 148 Snack Machine                18 days

  Small Machine                              8 days
  left 34 of 40 · 3 slots short
```

Replaces `MachineRow`'s current `6 shelves · 48 slots`, which describes the cabinet rather
than giving a reason to stop at it.

**Revised 2026-10-26, after rendering it.** The row first showed `left 170 of 170` on every
machine, which is not a rendering bug but the design being structurally empty: a visit's
purpose is to fill to par, and capture's headline default is literally `added = par −
remaining`. So after any successful visit every counted slot sits exactly at par, `left X of
Y` reads "full" forever, and `slots short` is zero in the same breath. Two of the three facts
were constants.

They are non-zero only on a **short fill** — the operator ran out of stock in the van. So the
stock line appears only then. Silence means we left it full, which is the truth and needs no
words.

That makes the age the one fact always shown, and every line a row does show is information.

### Definitions

- **`12 days`** — whole days between `countedAt` and now. A machine with no
  `StoredLatestVisit` reads **"never serviced"**, not a number derived from `.distantPast`.
- **`left 34 of 40`** — `Σ(remaining + added − removed)` across the last visit's lines,
  against `Σ par` across the current planogram's slots. Shown only alongside a short fill. A
  machine with no planogram has no denominator and reads the slot count alone.
- **`3 slots short`** — planogram slots where what we left is below par. "Short" rather than
  "low" to match the capture spec's *short fill*: one term per concept. A plain `< par` with
  no threshold fraction: a fraction is a tuning knob and there is no data to set it from.
  At zero the whole stock line is suppressed, not just this phrase.

All three are pure functions of plain values, so they live in `Domain/` beside the face join
and are tested with no SwiftData and no simulator.

## Tapping a row starts a visit

The machine list pushes capture directly. There is no intermediate screen.

This does not reopen the capture spec's rule that capture is a separate screen from browsing
(`2026-10-07-ios-visit-capture-design.md:56`) — that warns against mixing a keypad into a
browse screen, and a navigation push is not that. Capture remains its own screen with its own
draft and keypad.

### The `countedAt` hazard this creates

The capture spec stamps `countedAt` when **Start visit** is tapped. If a list row *is* Start
visit, a mis-tap stamps it — and `countedAt` drives drain order and the server's out-of-order
check. Back out, return an hour later, resume, and the observations submit dated to the
mis-tap.

**Leaving capture with nothing counted deletes the draft.** `makeSubmission()` already returns
`nil` for a draft with no counted lines, so one is pure residue: it cannot be submitted and it
blocks the "one open draft per machine" rule for no reason. Deleting it means a mis-tap leaves
nothing behind.

A draft with *any* counted line survives, as it must — that is somebody's work.

## What is deleted, and what is not

**Deleted — but with 2b, not here.** `Features/MachineFace/MachineFaceView.swift` is the
`@Query` wrapper and its two fixture previews. It stays as the tap destination until capture
exists to replace it: deleting it now would leave list rows with nowhere to go, the same way
wiring the outbox triggers before the network edge would have left a drain with nothing to
drain. So this change ships the row; the routing swap and the deletion land with capture.

**Kept, because capture needs all of it:**

- `Domain/MachineFace.swift` — the `slot → planogram → product` join. Capture needs `par` per
  cell for the fill-to-par default and snapshots `productId`/`priceCents`/`par` into the draft.
- `Features/MachineFace/ShelfLayout.swift` — the ragged-shelf sizing rule. Capture renders the
  same grid.
- `FaceGrid` — moves to capture, whose cells show a slot code and a typed count rather than a
  price. The container and its layout rule are unchanged; only the cell body differs, which is
  the split that was made when `MachineFaceView` and `FaceGrid` were separated.
- `Domain/Money.swift`.

So the planogram work is not thrown away. Only the browse screen built on top of it is.

## Tests

`MachineTriageTests` — pure, no container:

- Whole days from `countedAt`, including same-day reading `today` rather than `0 days`
- No last visit reads "never serviced"
- `left` sums `remaining + added − removed`, matching `VisitLine.levelAfter`
- No planogram yields no denominator rather than `of 0`
- `slots short` counts strictly below par; a slot left *at* par is not low
- A par of zero can never be short, and contributes nothing to capacity
- An uncounted planogram slot is excluded from `slots short` — unknown is not short
- Zero short slots suppresses the whole stock line, not just the phrase

`MachineListView` keeps the lazy `navigationDestination(for:)` routing from `1feb2fb`; a tap
now resolves to capture.

A capture-side test belongs with 2b: leaving with nothing counted deletes the draft, and
leaving with one counted line does not.

## Out of scope

The same treatment for the **location list** — "which location needs me" is the same
comparative decision one level up, and the same facts would aggregate. Worth doing, not worth
coupling to this.

A **server-computed depletion estimate**, which is the real answer to "is it worth opening"
and is additive to the machines payload when there is evidence the raw facts are not enough.

Expiry in the row, which waits on the expiration-tracking card.
