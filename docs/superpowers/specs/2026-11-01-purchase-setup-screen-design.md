# Vendor and date before the scan, not above it (Phase 9 addendum)

Move the purchase's vendor and date onto their own screen ahead of the scan
flow, so the purchase screen opens on the Scan button. Filed from the first
hands-on pass as "too much ui at the top of the screen forcing most of the work
towards the keyboard" — Shuffleboard `6ae50d9b75d56c3184e2eae9`.

Parent spec: [`2026-10-28-ios-purchase-logging-design.md`](2026-10-28-ios-purchase-logging-design.md)

## What changes

`PurchaseLogView` opens with a section holding a `DatePicker` and a vendor
`TextField`, then a section holding Scan, and only then the item rows. Two
sections of entry fields sit between the operator and the rows they spend the
whole session in, and the vendor field is the only keyboard work in an
otherwise keyboard-free pass.

After this there are two screens:

| Screen | Holds |
|---|---|
| **`PurchaseSetupView`** (new) | Vendor, date, "Start scanning" |
| **`PurchaseLogView`** | Scan, items, receipt, notes, save |

`LocationListView`'s cart button pushes the setup screen; "Start scanning"
pushes the purchase screen.

## Decisions

- **The setup screen owns the model.** `PurchaseLogView`'s
  `@State private var model = PurchaseLogModel()` becomes `let model:
  PurchaseLogModel`, constructed by `PurchaseSetupView`. This is what makes
  Back a real edit rather than a restart: the model outlives the pop, so rows
  scanned before a vendor correction are still there coming forward again.
- **Back is the only edit path.** The purchase screen shows the pair as its
  nav title — `"Costco · Oct 30"`, month-abbreviated day, still `.inline` — as
  a plain title, not a button. There is nothing to learn, and a second editor
  reachable from the purchase screen would mean two ways to change one value.
- **The `"Costco"` default goes.** `PurchaseLogModel.defaultVendor` was
  calibrated to seed data (see `vendpire-local-db-is-seed-data`); the operator
  reports vendors vary a lot and are often typed fresh. `vendor` starts empty
  and the setup screen seeds it from `@AppStorage("lastPurchaseVendor")`,
  writing back on continue.
- **Vendor memory lives in the view, not the model.** The model is the tested
  layer and gains no knowledge of `UserDefaults`, so no test can leak vendor
  state into the next one through it. For a repeat Costco run the field still
  arrives filled in; a new vendor is typed once.
- **Validation moves to the front, and stays in the model too.** "Start
  scanning" is disabled while the trimmed vendor is empty, which makes the
  purchase screen unreachable without one — clearing it on a Back visit just
  disables the way forward again. `save()`'s existing empty-vendor guard stays
  as a backstop rather than the primary signal.
- **No recent-vendors picker.** Purchases are not mirrored —
  `MirroredEntities` holds locations, machines, products, packs, planograms and
  visits — and the outbox that briefly carries one drains on sync. A real
  recents list needs a vendors endpoint, which is its own piece of work.
  `@AppStorage` is the whole of the local history available.

## The date

The date picker moves as-is. It defaults to today and is almost always right,
so it costs a screen it was already going to share with the vendor rather than
a screen of its own. `save()` keeps normalizing to noon
(`PurchaseLogModel.swift:279`), which is unaffected by where the value is
entered.

## Testing

`PurchaseLogModelTests.swift:272` asserts the submitted vendor is `"Costco"`
off the old default; it sets `model.vendor` explicitly instead. No other test
reads the default.

The rest is view code — initial focus, the disabled button, the `@AppStorage`
round trip, and the title's format — which the XCTest suite cannot reach here.
Hand-verified on the device, like the rest of this flow's UI.

## Not in scope

- A recent-vendors picker, per the decision above.
- Any API or OpenAPI change. `PurchaseSubmission` already carries `vendor` and
  `purchasedAt`; nothing about the write path moves.
- The pricing pass. Entry-field crowding at the *bottom* of the screen is a
  separate finding.
