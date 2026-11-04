# One receipt line at a time (purchase UX round 2)

Change the iOS purchase flow from "scan the whole cart, then price every row"
to "scan one item, enter its quantity and cost, add it, repeat." The operator
works with the receipt in one hand, reading it line by line, so each pass
through the sheet now corresponds to one receipt line.

Parent specs: [`2026-10-28-ios-purchase-logging-design.md`](2026-10-28-ios-purchase-logging-design.md),
[`2026-10-28-pack-contents-scanning-design.md`](2026-10-28-pack-contents-scanning-design.md),
[`2026-11-01-purchase-setup-screen-design.md`](2026-11-01-purchase-setup-screen-design.md)

## What changes

Today the scanner sheet stays up across scans. Each scan adds a row at qty 1
with no cost, or bumps an existing row, and a confirmation card with Undo
appears over the camera. Quantity and cost are typed on the list afterwards.

After this:

1. **Scan** or **Add manually** opens the sheet.
2. The item is resolved inside the sheet (camera, or name search).
3. The sheet moves on to **Entry**: product info, Qty, $, **Add**. Entry
   replaces the sheet's root with a push transition rather than being a real
   push, because an item can resolve from several screens deep (attach,
   create, case contents) and those screens collapse to the root in the same
   pass. The camera already swaps this way.
4. **Add** appends the row and dismisses the sheet.
5. The operator taps **Scan** again for the next item.

The sheet handles exactly one receipt line per presentation.

### Paths to Entry

All inside the sheet's `NavigationStack`:

| Path | Before Entry |
|---|---|
| Known code | Camera → Entry |
| Unknown code, attach | Camera → question → attach → Entry |
| Unknown code, single item | Camera → question → create form → Entry |
| Unknown code, case | Camera → question → case contents (scan or create each product) → create case → Entry |
| Add manually | Search → pick → Entry |

### The Entry screen

- **Header:** kind badge, name, and units per case for a case.
- **Already-on-purchase note:** when a row for the same record exists, a quiet
  line reads "Already on this purchase: 1 × $12.99". It is informational only.
  Adding still creates a **new** row.
- **Qty** starts at `1`.
- **$** has a segmented **Total | Each** control. The keyboard opens focused on
  $, because qty is usually 1.
- **Hint under $:** the number not typed. In Total mode, "= $12.99 each". In
  Each mode, "= $25.98 total". This counterpart shows only when qty > 1. A
  single-product case also shows "$0.54 / unit" at any qty.
- **Add** is a primary pill above the keyboard. It is disabled until $ parses
  as a dollar amount and qty is a whole number ≥ 1.
- **Cancel** in the toolbar dismisses the sheet and adds nothing. It replaces
  Undo.

### The list

Rows keep their editable Qty and $ fields. **The row's $ is always the line
total**, which is the stored value. When qty > 1, the hint under it shows the
each price: "$12.99 each" for loose items, and "$12.99 / case" for cases. A
single-product case adds "$0.54 / unit" at any qty, the same rule as today's
hint, so a case at qty 2 reads "$12.99 / case · $0.54 / unit". The keyboard arrows, the footer, the totals, and the receipt
status are unchanged.

## Decisions

- **One scan, one row.** Scanning something already on the purchase adds a
  new line instead of bumping qty, because a receipt can list the same item
  twice at different prices and the operator is reading line by line. The
  note on Entry catches an accidental rescan, and Cancel discards it.
- **Total / Each lives only on Entry.** The vendor decides whether the receipt
  prints a line total or an each price, so the operator needs both. The phone
  always stores a line total, so the server and the submission are unchanged.
  In Each mode the total is each × qty, which is exact.
- **The mode sticks for the purchase.** `PurchaseLogModel.costEntryMode`
  starts at `.total`. Each new entry starts in it, and toggling writes back to
  it straight away, even if that entry is then cancelled. One purchase has one vendor, so that covers "it depends on the store"
  without anything persisted. Remembering the mode per vendor across
  purchases is out of scope until it proves needed.
- **The row shows the total, not the each price.** If the row's $ were the
  each price, a total typed on Entry that doesn't divide evenly would round
  back wrong: $10.00 for 3 would show $3.33 and save as $9.99, and the
  receipt would no longer match.
- **Cases are finished before Entry, so draft rows go away.** "It's a case of
  items" pushes the contents flow inside the sheet, and `createPack` runs
  before Entry. Every row is therefore a real product or a real pack. The
  operator fills in contents at the same moment anyway. Creating a case now
  needs the network mid-loop, as creating a product already does.
- **Add manually uses the same Entry screen**, so there is one path for a
  receipt line.

## Code changes

### New: `LineEntry`

A pure value, alongside `PurchaseRow`:

```swift
nonisolated struct LineEntry: Equatable, Sendable {
    enum CostEntryMode: Equatable, Sendable { case total, each }

    let item: CatalogItem
    var quantityText: String   // "1"
    var amountText: String     // ""
    var mode: CostEntryMode

    var lineTotalCents: Int?   // total: amount; each: amount × qty
    var isComplete: Bool       // qty whole ≥ 1 and amount parses
    var counterpartCents: Int? // the number not typed, nil when qty ≤ 1 or incomplete
}
```

`counterpartCents` in Total mode is `lineTotal / qty`, rounded. It is for
display only.

### `PurchaseLogModel`

- **Add** `pendingLine: LineEntry?`. `resolver.onResolve` and `add(_ item:)`
  set it instead of appending a row.
- **Add** `costEntryMode: LineEntry.CostEntryMode = .total`.
- **Add** `updatePendingLine(quantityText:amountText:mode:)`, in patch form
  like `updateRow`. A mode change also sets `costEntryMode`.
- **Add** `commitPendingLine() -> Bool`. It appends `pendingLine.makeRow()`
  (kind from `item.isPack`, `totalCostText` = `lineTotalCents` via
  `Money.formatCentsForEditing`) and clears `pendingLine`. It returns false
  and changes nothing while the line is incomplete.
- **Add** `cancelPendingLine()`. It clears `pendingLine` and calls
  `resolver.dismissPendingScan()`.
- **Add** `existingLine(for item: CatalogItem) -> PurchaseRow?`. It returns
  the first row with the same kind and `recordId`.
- **Add** an each-price hint for rows: `eachCents` on `CaseSummary` for packs,
  and an equivalent for unit rows. Display only.
- **Remove** `addOrIncrementRow`, `scanConfirmation`, `undoLastScan`,
  `clearScanConfirmation`, `packDrafts`, `commitPackDraft`, `resolveDraft`,
  the draft check in `validateRows`, and the draft cleanup in `removeRow`.

### `BarcodeResolutionModel`

- `commitPendingCase()` no longer detaches a new resolver. It sets
  `isBuildingCase = true` on this resolver, keeping `pendingScan` (the code
  and the outside guess).
- `createPack` success reports through `onResolve` as today, which now lands
  on `pendingLine`.
- `dismissPendingScan()` also clears `isBuildingCase` and `contents`, so
  Cancel at any depth resets the resolver.
- **Remove** `onCommitPackDraft`.

### Views

- **`PurchaseLineSheet` (new)** owns the sheet's `NavigationStack`. Its root
  is either `BarcodeResolutionFlow` (Scan) or the name search (Add manually,
  moved from `AddCatalogItemSheet`). While `pendingLine` is set, it swaps
  `LineEntryView` in at the root with a push transition. Add calls `commitPendingLine()` and
  dismisses. Cancel calls `cancelPendingLine()` and dismisses, and so does
  swipe-down via `onDismiss`.
- **`LineEntryView` (new):** the Entry screen as described above.
- **`BarcodeResolutionFlow`** drops `confirmation`, `itemCount`, `onUndo`,
  and the confirmation card and item-count badge. Refusal messages over the
  camera stay. When `model.isBuildingCase` is set, it shows
  `CaseContentsView`.
- **`CaseContentsView`:** Done becomes Next and runs `createPack`. On success the resolver
  reports, `pendingLine` is set, and the sheet pushes Entry. The doc comment
  about draft rows is rewritten.
- **`PurchaseLogView`:** one sheet instead of two, opened in Scan or Search
  mode. Rows lose the draft branch and the "Add contents" pill. The hint under
  $ becomes the each-price line. The `draftShowingContents` destination is
  removed.
- **`CaseDetailsView`:** remove the reference to drafts.
- **Delete** `ScanConfirmation.swift` and `PurchaseRow.Kind.packDraft`.
- **Keep** `ScanGate`. The camera still has to keep going after a refused
  scan ("isn't a valid barcode", "that's a case"), and without the gate the
  same bad code would buzz on every frame.

### Errors

Resolution and creation errors stay where they are today, inside the sheet.
Add is a local append and cannot fail, because the button is disabled until
the entry is complete. Validation in `save` stays as the last check on lines
edited in the list.

## Testing

### `LineEntryTests` (new)

- In Total mode, `lineTotalCents` is the amount. In Each mode, it is
  amount × qty.
- Each, $10.00 × 3 gives 3000. Total, $10.00 at qty 3 gives 1000, with
  counterpart 333.
- `isComplete` is false for a blank or unparseable amount and for a qty of
  0, a negative qty, or a non-integer qty.
- `counterpartCents` is nil at qty 1.

### `PurchaseLogModelTests`

- A resolved scan sets `pendingLine` and adds no row. Commit appends exactly
  one row with the line total.
- Commit after scanning an item already on the purchase gives two rows, and
  `existingLine(for:)` returns the first.
- `cancelPendingLine()` leaves the rows untouched and clears the resolver's
  pending scan.
- After committing an entry in Each mode, the next `pendingLine` starts in
  Each.
- `add(item)` sets `pendingLine`.
- Commit to a case, then `createPack` succeeding, sets `pendingLine` to the
  new pack, with no row until commit.
- The each-price hint for unit and pack rows.
- **Remove** the tests for scan confirmation, undo, increment-on-rescan, and
  draft rows (currently around lines 958–1277). Keep the test of the
  `createPack` draft payload, starting it from `isBuildingCase`.

Run `ios:test` against the device and confirm the destination. The Simulator
crashes about 10 tests and reports green anyway.

### By hand on the phone

- Each of the five paths ends on Entry, and Add returns to the list with the
  row.
- The keyboard opens focused on $.
- Cancel at each depth (camera, question, create, case contents, Entry) adds
  nothing and leaves no stale state on the next Scan.
- Total/Each holds from one item to the next.
