# Count and Restock: visit entry on the web

**Date:** 2026-11-09
**Status:** draft, awaiting Jeremy's approval. One of two alternatives, both
kept. The other is the in-slot approach in
`2026-11-09-visit-layout-changes-web-design.md` (count and change in the same
panel). This one is the experiment Jeremy wants to try first.

Covers the five Shuffleboard "Web visit: …" cards (change price, put into an
empty slot, remove, replace, move incl. swaps) by changing how a visit is
entered, rather than adding an action per change.

Read first: `docs/diagrams/visit-layout-changes.md` (the verbs, the Nov 5
cases, the rules) and `docs/superpowers/specs/2026-11-08-mixed-slots-web-design.md`
(the "add a product behind" save path this extends).

## Why

On Nov 5 the operator repriced, moved, swapped, replaced and pulled products
across all five machines. The web visit form only knows "count and refill", so
the visit was entered by hand in the database. These changes will happen every
week. Entered carelessly, they silently lose sales: recording only the incoming
product leaves the outgoing product's last period unknown.

**Moving is how the operator reprices.** Changing a price on the machine itself
is a pain, so she usually moves a product into a slot that already charges the
price she wants, and the slot keeps its price. Move is the most common change.

## The idea

A visit is entered from two sets of photos, so enter it in two steps that match
them, **Count** and **Restock**, then **Review**:

1. **Count, from the before photos:** what was in each slot. This is
   today's count form.
2. **Restock, from the after photos:** what each slot holds now. The
   operator says what happened to each product, and the app derives the visit
   lines and the next planogram from the difference.

Jeremy enters visits slot by slot, usually on a laptop with photos beside the
browser, back-dated (`countedAt`). Phone-width web must work too.

## Goals

1. Every change from Nov 5 can be entered in Count and Restock without touching
   the database.
2. The operator describes what they see in the photos. They never write a
   `transferred` pull, an Added figure for a moved product, or an outgoing line
   by hand. The app derives them.
3. Before saving, the operator checks the before and after machine faces
   against the photos.
4. The visit and the next planogram version are saved together or not at all,
   effective from the visit's `countedAt`.

## Non-goals

- **Fixing mistakes after a visit is saved.** It's a separate effort. Jeremy's
  last fix was to a visit that already had a newer one after it, so that effort
  has to handle older visits. Here, repair means going back between steps
  before saving.
- The phone (iOS). REST stays backward compatible.
- Any change to the sales engine (`packages/domain/src/visits`).
- The planogram editor.
- Moving products between machines.
- Par. It stays a placeholder 10, and nothing new depends on it.

## Anti-goals (a failure even if it works)

- **The app guessing a move.** A product's destination is only ever what the
  operator said. A product that appears in a slot is new stock unless it's
  linked to where it came from.
- **A product leaving without a line.** Every product counted in Count that
  isn't in its slot after Restock gets `removed = remaining` with a reason.
- **A blank count saved as zero.** Blank means not counted, as today.
- **Sold out treated as removed.** "Same product, now 0" keeps the product in
  the planogram. Only "Emptied" or "Something else" takes it out.
- **The review disagreeing with what's saved.** The faces and the change list
  are built from the same data the save sends.
- **Breaking the phone or any REST client.** The published `addedBehind` keeps
  working.

## Decided with Jeremy

### Count

Today's form: the machine grid, a slot panel per slot, "Found in slot" (Left)
for every product in the slot (mixed slots front to back), Best by where
tracked. Found is counted before anything is pulled or loaded.

**Pulls of expired, damaged or recalled stock are entered here** ("Pulled
something out?", as today). Comparing Count and Restock can't detect these: "pull 2
expired, load 8" and "load 6" give the same after count. Count fits because
the expired item is in the before photo.

Added moves out of Count. It's entered in Restock.

### Restock (four actions)

Same grid, walked slot by slot with Next like Count. Each slot lists what
Count recorded as "2× Skittles" (Found less any Count pull), with its price.
Every counted product gets exactly one of four actions, front to back. The
buttons are present tense; the answered summary reads past tense ("✓ Moved →
B2"):

| Action | Operator enters | Line it fills |
|---|---|---|
| **Add** | units that went in (0 allowed) | `added` |
| **Move →** | the destination slot | `removed = remaining`, `transferred` |
| **Swap ⇄** | the other slot | two linked moves |
| **Pull ▾** | Back to the van / Expired / Damaged / Recalled | `removed = remaining`, `destocked` or the bin reason |

Each slot also has:

- **Price**, always visible, pre-filled from before (see Price).
- **+ Add product**: pick a product and enter its Added. It goes in front when
  the slot has no staying product, behind otherwise. "Replace" is Move or
  Pull on the old product plus + Add product. There is no separate replace,
  put-in, emptied or add-behind action.

**Added always means the line's `added`:** every unit of this product that
went into this slot, wherever it came from. For an arrival (a moved or swapped
product, or + Add product) that is the after-photo count, carried units
included: Cheetos moved A1 → B1 with 4 left, topped to 10, is Added 10.

**Arrivals.** A moved or swapped product appears in its destination tagged
"← from A1", waiting for its Added. When + Add product picks a product that
left another slot this visit, the app offers a "Came from A1?" chip; tapping it
turns the add into a move. Untapped, it's new stock. The app never links on its
own.

**Now is derived**, never entered: Left − pulled + Added. A slot is empty when
every product in it was moved or pulled and nothing was added.

**Empty-before slots.** Every machine slot appears in Restock, including ones
with no planogram entry (Nov 5's Green Horizons A5), so a product can be put
in.

### Review: before and after faces

- Before saving, a review step shows the machine **before** (Count) and
  **after** (Restock). Each cell shows product, price, and units (Left on the
  before face, the derived Now on the after face). Mixed slots list every
  product, front first. The after face is where the operator checks Added
  against the after photo.
- Changed cells are tinted on the after face, and the old product or price is
  shown crossed out.
- Under the faces is the list of changes the app derived, in plain words:
  `66 → 27 · Pistachios Chili · now $1.50`, `66 · KitKat in · 3`,
  `C4 · Calbee back to the van (3)`.
- **Laptop width:** faces side by side. **Phone width:** one face at a time
  with a Before / After switch, opening on After.

### Going back

The step bar (Count · Restock · Review) is clickable at any time before saving.
Going back to Count keeps every Restock answer, and Restock recalculates from it.
If a Count edit makes a Restock answer impossible (66 no longer has the
pistachios that were "moved to 27"), that answer is **flagged, not quietly
changed**, and the review lists flagged slots and blocks Save until each is
resolved.

### Price

The machine charges per slot.

- Every slot in Restock shows its price, pre-filled from before and editable.
  A different price is a price change for every product in the slot.
- **A moved product takes the destination slot's price.** The change line says
  so when it differs (`Nerds → 23 · now $1.50, was $2.25`).
- A slot with no price yet (empty before) asks for one. When the product came
  from another slot, that slot's price is pre-filled.
- Old prices stay on old lines. The outgoing product's line carries the price
  from before, and incoming lines carry the price after. Lines in one slot may
  differ in price.

**Claude's call:** no "prices follow the products" option for swaps. Nov 5's
13↔23, where they did, is entered as a swap plus two price edits.

## Claude's calls

- **Mixed slots in Restock:** an action per product, front to back. Price is
  asked once per slot.
- **Swaps** are two moves linked in Restock (13 → 23 and 23 → 13). The review
  shows them as one ⇄ line.
- **A product pulled in Count can still leave in Restock only if every unit
  goes the same way.** A line has one `removed` and one reason. If Count
  pulled 1 expired and Restock says the rest went to the van, the review flags
  it. The operator either records all of it under one reason or leaves the
  product in place. Splitting reasons would change the engine. This is rare.
- **The save path is the same as the in-slot design**, so the server work
  carries over whichever approach wins (next section).
- **A product left blank in Count can't change in Restock.** It has no
  `remaining`, so there's no line to hang a pull or a move on. Restock shows it
  as "not counted" and offers only a link back to Count. Left blank, it gets
  no line, as today.
- **Every counted product needs a Restock answer.** Unanswered slots are listed
  on the review, and Save is blocked until they're answered. One explicit
  button, "Mark the rest unchanged, nothing added", answers them all as
  Added 0. Nothing is defaulted without the operator pressing it.
- **"Found here, not in the planogram" is entered in Restock** (Nov 5 One Stop
  E4, NV Biscuits behind the Reese's) with + Add product, its Added being
  everything in the slot after. Count has no "Add a product behind" (removed
  2026-11-10 at Jeremy's request). Nothing is lost for sales: a product new to
  the planogram has no previous fill, so its first interval is unknown either
  way. Its Count pulls and its Before-face entry are what go.

## Save path

Extends the PR #46 path in `VisitServiceImpl.create` / `planogramAfter`.

- The client derives two things from Count and Restock: the **visit lines** and a
  **`layoutChanges`** list (move, remove, put in, replace, add behind, set
  price) on the visit create input, replacing the single-purpose
  `addedBehind`. `planogramAfter` applies the changes in order to the
  planogram the form opened with, then validates with the existing slot rules.
- **`addedBehind` stays accepted** (it's in the published
  `openapi/vendpire.yaml`) and is read as add-behind entries. The web sends
  only `layoutChanges`. `layoutChanges` is published on REST as an optional
  field. Its shapes must stay additive after that.
- **The server checks the changes against the lines.** For example, a move
  needs a `transferred` pull at the source equal to `remaining`, no Added on
  the outgoing line, and a line for the product at the destination. It rejects
  with a message naming the slot.
- **Kept from PR #46:** planogram written first, soft-deleted if the visit
  insert fails; reject if the planogram changed since the form opened; reject
  if `countedAt` isn't after the current planogram's `effectiveFrom`. A visit
  with no changes saves at any date, as today.
- **The changes come from the Restock answers**, not from diffing the two
  layouts: a diff can't tell a move from a remove plus an add, and guessing is
  an anti-goal. One function turns the answers into lines and changes (web),
  and another applies changes to a planogram (shared package), so the review,
  the client save and the server can't drift. Both are pure and are where most
  of the tests go. Each Nov 5 case in
  `visit-layout-changes.md` is a ready-made fixture.

## Left to the builder

- Exact `layoutChanges` entry shapes (follow `CLAUDE.md` naming).
- Component structure and styling (`docs/design-system.md`). Whether the three
  steps are routes or one screen with a step bar.
- How "where did it go?" picks a slot: tapping the grid, a short list of
  likely slots, or both.
- Whether a visit with no layout changes still shows the review step.
- Whether to build behind a toggle next to the current form while it's an
  experiment.

## Open question for Jeremy

**Partial moves.** Every Nov 5 move took the whole product out of its slot.
Does the operator ever move only some units (2 of 5 pistachios to 27, 3 stay
in 66)? This design assumes no: "Same product" and "it left" are separate
answers, and a move pulls exactly `remaining`. If yes, Restock needs a "some
moved to slot ___" answer under "Same product", and the move check becomes
`removed ≤ remaining`. Settle this before the `layoutChanges` shapes are
published.

## Open for later

- Mistake handling after save (its own effort).
- Phone capture of Count and Restock.
- Which approach (this one or in-slot) becomes the permanent design.
