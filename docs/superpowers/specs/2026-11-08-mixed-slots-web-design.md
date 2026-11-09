# Mixed slots on the web

**Date:** 2026-11-08
**Status:** design approved in conversation; ready for planning

## Why

The operator has started loading a second (sometimes third) product *behind*
the first one in a single spiral. On Nov 5 alone, One Stop Systems got Wavy Lay's
behind Ruffles in A0, Flamin Hot Cheetos behind Funyuns in A8, Salt & Vinegar
behind BBQ in C2, and three flavors of pistachios sharing E9. This is now a
regular practice, not a one-off.

The visit engine already handles it: a visit line is keyed by
`(slotCode, productId)`, and the server already accepts two products in one
slot on a visit. What can't represent it is the **planogram**, which rejects a
repeated slot code, and the two **web screens** built on one product per slot.
Without a mixed planogram, the next visit never prompts for the back products,
so they go uncounted and their sales go unknown.

The operator currently works from the **web** for visits, entering them after
the fact from before/after photos. Web comes first; the phone follows in a
later project.

## Facts from the operator

- A machine charges **per slot**, never per product. Every product in a slot
  sells at the slot's one price.
- Every product in a mixed slot can be counted separately from the photos,
  including the ones at the back. Per-product counts are always available.
- Products sit in a front-to-back order. Order is for display and data entry
  only: each product's sales are computed against its own previous line, so
  order never touches the money.
- Par is ignored in this operation (placeholder 10 everywhere). Don't build
  anything that depends on it.

## Goals

1. A planogram can hold a mixed slot.
2. The web planogram editor can create and edit mixed slots.
3. The web visit entry screen can count mixed slots.
4. While entering a visit on the web, the operator can **add a product behind**
   an existing one. Saving the visit updates the planogram to match.

## Non-goals

- **Any phone (iOS) change.** Until the phone project, the phone shows only the
  front product of a mixed slot. Claude fills in the back products' counts by
  hand each week, so this gap is covered for now.
- **The other at-visit layout changes:** change price, remove, replace and move
  are later projects, one at a time. In this project they stay as they are today
  (a price change or a replacement still happens in the planogram editor).
- Per-product prices within a slot.
- Any change to the sales engine (`packages/domain/src/visits`).

## Anti-goals (failure even if it "works")

- **A blank count saved as zero** for any product in a mixed slot. A blank must
  stay "not counted", exactly like today's single-product rule in
  `visitRows.ts`: a zero invents sales, a missing line doesn't.
- **A visit saved but the planogram not updated, or the reverse.** If the
  operator added a product behind, the visit and the new planogram version are
  written together or not at all.
- **Back products silently dropped** on save from the planogram editor. Today's
  editor keys rows by `slotCode`, and a naive change would collapse a mixed slot
  to its front product.
- **The phone breaking.** The API shape must stay readable by the current phone
  build. There is no forced update.

## Decided

### Data shape: repeat the slot code

A mixed slot is the same `slotCode` appearing more than once in
`planogram.slots`, **in front-to-back order**, each entry with the same
`priceCents`. A normal slot is one entry, as today.

```
{ slotCode: "A0", productId: <Ruffles>,   par: 10, priceCents: 150 }   // front
{ slotCode: "A0", productId: <Wavy Lay's>, par: 10, priceCents: 150 }  // behind
```

Chosen over a nested `{ slotCode, priceCents, products: [...] }` because:

- The REST/OpenAPI `Planogram` shape is unchanged, so the phone keeps decoding
  it. The phone's `CaptureOrder` keeps the first product per slot, so it
  degrades to "front product only" rather than crashing.
- Planograms Claude writes directly to the database during the interim use
  this shape, so they work in the new editor the day it ships.

### Server rules for a planogram (`PlanogramServiceImpl.create`)

- A slot code **may** repeat (replaces today's `Duplicate slot code` rejection).
- The same `(slotCode, productId)` pair may **not** repeat.
- All entries for one slot must share one `priceCents`. Reject with a message
  naming the slot.
- Array order is the front-to-back order and must be preserved end to end
  (storage, API, editor).
- Existing rules stay: slot must exist on the machine, products must exist,
  `effectiveFrom` must be newer than the current version's.

### Visit lines

No rule changes. Lines in the same slot may carry **different** prices:
in a future "replace" visit the outgoing product's line keeps its old price.
Do not add a same-price rule to visits.

### Web visit entry (option A, chosen from mockups)

- **Machine grid:** a mixed slot shows a small count badge and lists its
  products front to back.
- **Slot panel:** one panel per slot with the slot code, the slot price shown
  once, and **one row per product**, front first. Each row has "Left in slot"
  and "Added", the previous-level hint ("filled to 2 last visit" or "new in this
  slot"), plus today's per-product "Removed" with a reason and "Best by" where
  the product tracks expiration.
- **Keyboard order:** Tab/Next walks every product in the slot before moving to
  the next slot.
- **Counted progress:** a slot is counted only when every product in it has a
  count. The "N of M slots counted" summary and the uncounted-slots warning
  follow that rule.
- Form state in `visitRows.ts` and `VisitEntryScreen.tsx` is keyed by
  `(slotCode, productId)`, not `slotCode`. Every `.find(slotCode)` in these
  screens is a bug once a slot repeats.

### Add a product behind (during a visit)

- An **"Add a product behind"** action in the slot panel. The operator picks a
  product and enters its "Added" (and "Left in slot" if some were already there
  uncounted; defaults to blank, never 0).
- The new product is appended behind the slot's existing products and takes the
  slot's price.
- On save, the server records the visit, **and**, if any products were added
  behind, creates a new planogram version: the current planogram plus the
  added entries, with `effectiveFrom` = the visit's `countedAt`.
- Both writes succeed or neither does. **Claude's call:** do this in one server
  request (the visit create mutation accepts the layout change) rather than the
  client making two calls, so a dropped connection can't leave half of it.
  The builder chooses how to make it atomic (a MongoDB transaction, or a
  compensating delete).
- **Claude's call — back-dated visits:** the planogram rule "effectiveFrom must
  be newer than the current version's" stays. If a visit's `countedAt` is older
  than the current planogram and it adds a product behind, the save is
  rejected with a message telling the operator the planogram has changed since
  that visit, so nothing is half-applied. Plain visits without layout changes
  still save at any date, as today.
- **Claude's call — planogram changed while typing:** the new version is built
  from the planogram the form opened with (the visit's `planogramId`). If that
  is no longer the current version at save time and the visit adds a product
  behind, reject the save and ask the operator to reload, rather than silently
  merging onto a layout they never saw.
- "Add behind" applies only to a slot that already has a product. Putting a
  product into an **empty** slot (Nov 5's Coke Zero in A5) is the "introduce"
  change, a later project.

### Web planogram editor

- A slot shows its price once and an ordered list of products. The operator can
  add a product to a slot, reorder its products, and remove one.
- Editing the slot price changes every entry for that slot.
- Saving creates a new version, as today.
- The machine face on the web (`SlotFaceGrid` / machine screens) lists every
  product in a mixed slot, front first.
- Removing a product from a slot here (outside a visit) behaves like today's
  editor replacement: the next visit won't list it, so any stock left in the
  slot goes uncounted. The editor should warn when removing a product the last
  visit left stock of. **Claude's call:** a warning, not a block.

### Web visit history

**Claude's call, added during review:** `MachineVisitsScreen.tsx` also finds a
visit's line by `slotCode` alone, so it would show only one product of a mixed
slot. It lists every line of a mixed slot, front first. Display only.

## Left to the builder

- Component structure, styling within the existing design system
  (`docs/design-system.md`), and how the product picker for "add behind" works
  (reuse the existing product search).
- How the tRPC input for "visit with layout changes" is shaped, as long as the
  REST `POST /visits` contract stays backward compatible for the phone (any new
  field is optional).
- Atomicity mechanism (above).
- Migration: none expected. Existing planograms already satisfy the new rules.

## Interim, until this ships

Claude enters each week's changes directly into the staging database from the
operator's photos and notes, using the repeated-slot shape above. Until the
editor ships, **nobody saves a machine's planogram from the web editor** once it
holds a mixed slot, because today's editor would drop the back products.

## Later projects (in order to be decided)

1. Change price during a visit (updates the planogram on save).
2. Introduce a product into an empty slot during a visit.
3. Remove a product from a slot during a visit.
4. Replace a product during a visit.
5. Move a product to another slot during a visit.
6. The phone: mixed slots in capture, then the at-visit changes.
