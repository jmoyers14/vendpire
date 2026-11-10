# Layout changes during a web visit

**Date:** 2026-11-09
**Status:** draft, on hold. One of two alternatives: this is the in-slot
approach (count and change in the same panel). The Count and Restock approach
(`2026-11-09-visit-count-restock-web-design.md`) is being explored alongside
it, and Jeremy wants to keep both.

Covers five Shuffleboard cards together: change a slot's price, put a product
into an empty slot, remove a product, replace a product, and move a product
(including swaps). They share one UI and one save path, so this doc designs
them as a single piece. They're built in three phases (below).

Read first: `docs/diagrams/visit-layout-changes.md` (the verbs and the Nov 5
cases) and `docs/superpowers/specs/2026-11-08-mixed-slots-web-design.md` (the
"add a product behind" save path this extends).

## Why

On Nov 5 the operator repriced, moved, swapped, replaced and pulled products
across all five machines. The web visit form only knows "count and refill", so
the visit was entered by hand in the database. Jeremy expects these changes
every week. When a change is entered carelessly, sales go missing without any
error: if only the incoming product is recorded, the outgoing product's last
period becomes unknown.

**Moving is how the operator reprices.** Changing a price on the machine itself
is a pain, so she moves a product into a slot that already charges the price
she wants. That makes move the most common change and the most important one to
get right.

## How a visit is entered (unchanged)

Jeremy enters visits on the web after the fact, **slot by slot**, from before
and after photos, back-dated to when they happened (`countedAt`). Usually on a
laptop with the photos beside the browser. Phone-width web has to work too.

## Goals

1. Each of the five changes can be entered in the web visit form while
   counting, starting from the slot it affects.
2. Every change writes all the visit lines it needs. In particular, the
   outgoing product always gets a line. The operator never has to write a
   `transferred` pull by hand.
3. Before saving, the operator can check the machine as it's left against the
   after photo.
4. The visit and the next planogram version are saved together or not at all,
   effective from the visit's `countedAt`.

## Non-goals

- The phone (iOS). The REST contract stays backward compatible. Phone capture
  of these changes is a later project.
- Any change to the sales engine (`packages/domain/src/visits`). The verbs
  already compute correctly.
- The planogram editor. It keeps working as it does after PR #46.
- Moving products between machines.
- "Before/after counts as the entry format" (the idea in the layout-changes
  doc). This design keeps Left / Added / Pull.
- Par. It stays a placeholder 10 and nothing new depends on it.

## Anti-goals (a failure even if it works)

- **A change that leaves the outgoing product without a line.** Remove,
  replace and move must each write the outgoing line (`removed = remaining`,
  with its reason). A sold-out product moving out still needs `Count 0`.
- **A visit saved with the planogram not updated, or the reverse.**
- **The after face disagreeing with what's saved.** The review screen must be
  built from the same data the save sends, not from a separate guess.
- **A blank count saved as zero.** Same rule as today: blank means not
  counted.
- **Sold out treated as removed.** Only the explicit Remove action takes a
  product out of the planogram (Green Horizons E6 Kars, Nov 5).
- **Breaking the phone or any REST client.** The published `addedBehind` field
  keeps working.

## Decided with Jeremy

### Layout: count in the slot, changes collected in a list (option C)

- Counting stays as it is today: tap a cell on the machine grid, the slot panel
  opens, and you enter Left / Added per product.
- **You start a change from the slot it affects.** The slot panel gets the
  actions (below). Each change fills in the lines it needs.
- **A running "Changes this visit" list sits under the grid.** One plain line
  per change, for example `66 → 27 · Pistachios Chili · 2 carried` or
  `13 ⇄ 23 · Nerds now $1.50 (was $2.25) · Famous Amos now $2.25 (was $1.50)`.
- **Changed slots get a marker on the grid:** → moving out, ← moving in,
  ⇄ swap. Other changes (price, put in, remove, replace) get a plain "changed"
  marker. **Claude's call** on the exact glyphs.

### Picking a destination: tap the grid

"Move to…" puts the grid into pick mode, and you tap the destination slot.

- An empty slot (in the after state) gets the product.
- An occupied slot asks: **put behind** (the destination becomes mixed, as in
  One Stop B6 → A0) or **swap** (the destination's products move to the source
  slot).
- Cancel leaves pick mode with nothing changed.

### Price: a move keeps the destination slot's price

- Price belongs to the slot. A moved product sells at the destination slot's
  price. **No question is asked.** The change line says so when it differs:
  `Nerds → 23 · now sells at $1.50 (was $2.25)`.
- In a swap, each product takes its new slot's price, so the prices stay where
  they were and the products change places.
- **Changing a slot's price is its own, rarer action** on the slot panel, for
  when she does reprogram the machine. It sets one price for every product in
  the slot.

### Review: before and after faces

- Before saving, a review step shows the machine **before** (as the planogram
  was when the form opened) and **after** (as it's left).
- Each cell shows **product, price, and the units left** (the walk-away
  level). That's what gets checked against the photos. Mixed slots list every
  product, front first.
- Cells that changed are tinted on the after face, and the old product or price
  is shown crossed out.
- The changes list sits under the faces, then Save.
- **Laptop width:** the two faces side by side.
- **Phone width:** one face at a time with a Before / After switch, opening on
  After. The crossed-out old values make it readable without switching.

### Phases

1. **Foundation + move/swap:** the changes list, grid markers, pick mode, the
   review step, the `layoutChanges` save path (with add behind moved onto it),
   and move in all its forms (into an empty slot, behind, swap).
2. **Remove, put in, replace.**
3. **Change a slot's price.**

Each phase ships on its own. After phase 1, a visit that also needs a price
change, removal or new product still falls back to today's workarounds.

## Each change

The verbs are as in `visit-layout-changes.md`. "Remaining" is the Left count
the operator already typed for that product in that slot.

| Change | Starts from | Lines written | Planogram after |
|---|---|---|---|
| **Move** to an empty slot | product row, "Move to…" | source: `removed = remaining`, reason `transferred` · destination: new line, `added = carried + new stock` | product leaves source, enters destination |
| **Move behind** | same, tap occupied slot → put behind | same | appended behind the destination's products |
| **Swap** | same, tap occupied slot → swap | each product: pulled `transferred` at its source, loaded at its destination | products trade slots |
| **Remove** | product row, "Remove from slot" | `removed = remaining` with a reason (destocked, expired, damaged, recalled) | product leaves the slot; slot unassigned if it was the only one |
| **Put in** | empty slot, "Put a product in" | new line with `added`, at the slot price | slot gains the product |
| **Replace** | product row, "Replace…" | outgoing: `removed = remaining` with a reason · incoming: new line with `added` | incoming takes the outgoing's position |
| **Change price** | slot panel, Price | every line in the slot carries the new price | every entry in the slot gets the new price |
| **Add behind** (exists) | slot panel | as today | as today |

Details:

- **A move or remove needs the product counted first.** The action is disabled
  until Left is entered, because the outgoing line's `removed` is that count.
  Left can be 0.
- **Carried units are filled in, not typed.** At the destination, the form
  shows `2 carried + [ ] new` and saves `added` as the sum. If the source's
  Left changes later, the carried number updates with it.
- **Moving into an empty slot needs a price.** The slot has no price yet, so
  the destination asks for one, pre-filled with the price at the source. This
  is the one move that asks. The same applies to Put in.
- **"Empty" means empty in the after state.** A slot emptied by an earlier
  change in this visit (66 after the pistachios moved out) accepts Put in or a
  move, so "KitKat into 66" works.
- **Old prices stay on old lines.** Sales up to this visit are at the old price.
  The outgoing line of a replace keeps the slot's old price, and the new price
  is on the incoming line. Lines in one slot may carry different prices, so no
  same-price rule is added to visits.
- **Swaps are entered as one action** and show as one ⇄ line, but are stored as
  two moves. There is no "prices follow the products" option. Nov 5's
  Prographics 13↔23, where the prices did follow, is a swap plus two price
  changes, so it can only be entered in full once phase 3 ships. Use it as a
  phase 3 test case, not a phase 1 one. **Claude's call**, based on Jeremy
  saying she usually keeps the slot price.
- **A product leaving its slot has one pull, its leaving pull.** A line holds
  one `removed` and one reason. If a Pull (say 1 expired) is already entered
  on a product, Move, Remove and Replace are blocked with a message saying so.
  If every unit left for the same reason, she can enter it as one pull and
  then mark the product as leaving. Splitting a line across two reasons would
  change the engine, which is out of scope. **Claude's call**: this is rare,
  and blocking it never books good stock as a loss.
- **A product leaving its slot has no Added.** Starting a move, remove or
  replace clears Added on that product's line and locks it. The server rejects
  a leaving line with `added > 0`. **Claude's call.**

## Editing and undoing changes

**Claude's call** (proposed, not objected to): tapping a line in the changes
list opens its slot with the change selected, and each line has an undo. Undo
removes the change and every line it generated, but keeps counts the operator
typed (Left, Added on pre-existing products, best-by). Undoing a change that a
later change depends on (undoing a move out of 66 after KitKat was put into
66) undoes the dependent change too, and says so first.

## Save path

Extends the PR #46 path in `VisitServiceImpl.create` / `planogramAfter`.

- **One `layoutChanges` list** on the visit create input replaces the
  single-purpose `addedBehind`. Each entry is a discriminated union over the
  change types above. `planogramAfter` applies them in order to the planogram
  the form opened with and validates the result with the existing slot rules
  (one price per slot, no repeated `(slotCode, productId)`, slot exists on the
  machine).
- **`addedBehind` stays accepted** because it's in the published OpenAPI
  (`openapi/vendpire.yaml`). The server reads it as add-behind entries. Both
  fields are optional. **Claude's call:** the web client sends only
  `layoutChanges`.
- **`layoutChanges` is published on REST** like any other input field (the
  generator does this by default), optional and additive. **Claude's call:**
  `addedBehind` set the precedent, the phone will need it later, and working
  around the generator isn't worth it. From here on, changes to its entry
  shapes must stay additive.
- **The server checks the changes against the lines.** For example, a move
  needs a `transferred` pull at the source equal to that line's `remaining` (and
  no Added on it),
  and a line for the product at the destination. A remove or replace needs the
  outgoing line's `removed = remaining`. It rejects with a message naming the
  slot. The lines stay the source of truth for money, and the changes are the
  source of truth for the planogram.
- **Kept from PR #46:** planogram written first, soft-deleted if the visit
  insert fails; reject if the planogram changed since the form opened; reject
  if `countedAt` isn't after the current planogram's `effectiveFrom`. A visit
  with no changes saves at any date, as today.
- **The review faces come from the same model** the client sends. The client
  computes the after planogram with the same apply-changes function the server
  uses. **Claude's call:** put that function in a shared package
  (`packages/domain` or wherever `slotsWithAddedBehind` can move to) so the two
  can't drift.

## Left to the builder

- Exact `layoutChanges` entry shapes and field names (follow `CLAUDE.md`
  naming), and whether replace is its own entry or remove + put in at a
  position.
- Component structure, styling in `docs/design-system.md`, and the breakpoint
  between side by side and the switch.
- How pick mode looks on the grid, and the wording of change lines.
- Whether the review is a separate screen or a section that expands above
  Save, as long as it's shown before every save that includes a change.
  **Claude's call:** a visit with no changes may skip it.
- Tests: the apply-changes function and the line generation per change (each
  Nov 5 case in `visit-layout-changes.md` is a ready-made fixture), plus server
  rejection cases.

## After this ships

- The Shuffleboard cards for these five changes are closed or folded into the
  phase cards.
- The iOS cards ("change a slot's price", "reorganize a machine") inherit this
  design for the phone.
