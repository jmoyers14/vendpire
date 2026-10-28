# Scanning a case's contents (Phase 9 addendum)

Let the operator scan the bags inside a case while creating it, and route each
bag code through the same attach-or-create decision the case code itself went
through. Found during the Phase 9 field test: the contents editor offers a flat
`Picker` over every active product and a hand-typed bag barcode, which is the
one place in the flow where the camera stops being useful.

Flow diagram: [`docs/diagrams/pack-contents-scanning.md`](../../diagrams/pack-contents-scanning.md)
· parent spec: [`2026-10-28-ios-purchase-logging-design.md`](2026-10-28-ios-purchase-logging-design.md)

## What changes

Today a content row (`BarcodeNotFoundSheet.swift:305-348`) is a `Picker` over
every active product plus — when set to "New product…" — name, category, and a
typed bag barcode, with the product created later by `createPack`.

After this, a content row holds a **real `productId`**, chosen through one of
three doors, all of which end the same way:

| Door | What it does |
|---|---|
| **Scan** | Runs the full resolution tree on the bag code, packs excluded |
| **Search** | The name-ranked `CatalogItemMatches` list, products only |
| **New** | Creates a product immediately with `upc: nil` — the no-barcode case |

## Decisions

- **The inner flow is full parity, product-only.** A scanned bag code that
  misses the mirror gets the candidate lookup, the "Maybe" card, and
  attach-before-create as explicit peers. The duplicate guard is the entire
  reason the outer sheet refuses to default into either branch, and a
  barcode-less CSV-imported product is exactly as likely to be the thing inside
  a case as the thing on a shelf.
- **Create is immediate, not deferred.** The inner sheet's Create calls
  `createProduct`, upserts to the mirror, and hands back a real id — the same
  shape attach already produces. Every row becomes uniform and `prepare` loses
  its second mode entirely.
- **A pack hit on an inner scan is refused** with "That's a case, not an item."
  A case cannot contain a case, and the likeliest cause is the operator scanning
  the outer box a second time.
- **`contents` moves into the model.** It is `@State` in the view today, while
  that file's own doc comment promises every rule lives in the model. Choosing a
  row's product now touches the network, so it stops being view state — and the
  inner outcome becomes a plain model mutation the tests can reach instead of a
  binding threaded through a pushed destination.

## Architecture

One decision tree, instantiated twice.

### `BarcodeResolutionModel`

`@MainActor @Observable`, extracted from `PurchaseLogModel`. Owns one
`pendingScan`, one `candidateFetch`, `errorMessage` / `errorStatusCode`, and the
`attach` / `createUnit` / `createPack` calls. Constructed with
`init(allowsPacks: Bool, onResolve: (CatalogItem) -> Void)`.

`allowsPacks` controls exactly two things — whether a `.pack` resolution is an
outcome or a refusal, and whether the create step offers the Item/Case segmented
control. `onResolve` reports the outcome rather than mutating anything itself,
which is what lets the same type serve both callers.

- `PurchaseLogModel` holds one with `allowsPacks: true`; its `onResolve` calls
  `addOrIncrementRow`.
- The create-pack step holds one with `allowsPacks: false`; its `onResolve`
  writes `contents[rowId].productId`.

Two instances means two independent pending slots and two independent in-flight
candidate fetches, with no stack and no depth guard: the inner resolver has no
case branch, so there is no third level.

### `MirrorCatalog`

The memoized product/pack read currently inlined in `PurchaseLogModel`
(`catalogCache`, `productNamesCache`, `catalogDidChange`), extracted so the
purchase model and both resolvers share **one** cache. This is correctness, not
tidiness: an inner create must invalidate the outer resolver's and the purchase
screen's view of the catalog, and three private caches cannot do that.

Products-only search is `CatalogSearch.items(products: products, packs: [])` —
no new parameter needed.

### `PackContentDraft`

Replaces `NewPackContent`:

```swift
struct PackContentDraft: Identifiable, Equatable, Sendable {
    let id = UUID()
    let productId: String
    /// For display — the row shows a name without re-reading the mirror,
    /// matching what `PurchaseRow` already does.
    let name: String
    var unitsText: String
}
```

**There is no unresolved row.** `productId` is non-optional because a row is
only appended once a product resolves — the three doors live on a standing "Add
a product" affordance below the list, not inside an empty row waiting to be
filled. A row therefore cannot be blank, which removes the empty-row state, the
`"New product…"` sentinel, and `prepare`'s blank-row filter in one go.

`prepare` keeps only its units validation and its offset-carrying row numbering;
the name / category / bagCode branch goes away with the fields.

### Views

- `BarcodeResolutionFlow(model:)` — the scanner-or-sheet switch currently
  inlined at `PurchaseLogView.swift:76-86`, extracted so both levels share it.
- `BarcodeResolutionSheet(model:)` — `BarcodeNotFoundSheet` renamed, with the
  Item/Case control and the pack rows in its attach list conditioned on
  `allowsPacks`.
- The inner flow is a **pushed destination** on the NavigationStack already
  inside the sheet (`BarcodeNotFoundSheet.swift:56`), not a nested sheet: a
  sheet over a Form in a sheet fights detents, and pushing keeps the case form
  alive so its state survives the round trip. Resolving or cancelling pops and
  clears the inner resolver.

## Error handling

| Failure | Behavior |
|---|---|
| Inner scan resolves to a pack | "That's a case, not an item" — row unchanged |
| Inner scan is invalid | The existing invalid-barcode message, on the inner sheet |
| Inner candidate lookup fails | Inner sheet opens with no Maybe card; entry proceeds |
| Inner create/attach rejected (409) | The server's sentence plus one-tap "use existing instead", scoped to the inner sheet; the case form behind it is untouched |
| Inner create/attach network failure | Error on the inner sheet, nothing written, operator retries |
| Case form abandoned after inner creates | Products stay, mirrored — the stance `createPack` already takes on partial failure, just earlier |

## Testing

Swift, on a device — the Simulator aborts tests and still reports green.

New:

- Inner resolution: product hit sets the row's product; pack hit refuses and
  leaves the row alone; unknown parks an inner pending scan without disturbing
  the outer one.
- Two candidates in flight: an inner lookup must not overwrite the outer
  `pendingScan.candidate`, and a late inner answer must not land after the
  operator rescans.
- Inner attach and inner create each upsert and yield a usable `productId`.
- One `MirrorCatalog`: a create through the inner resolver is visible to the
  purchase screen's next search without an explicit refresh.
- `createPack` with every row already resolved creates only the pack.

Changed — these cover `prepare`'s deleted second mode and must be rewritten
rather than deleted, since the behavior they protect still exists one level
down:

- `testCreatePackRejectsAnUnparseableBagCode` → the bag code is now validated by
  the inner resolver at scan time.
- `testCreatePackNumbersTheRowTheOperatorSees` → row numbering survives; only
  the fields it reports on change.
- `testCreatePackCreatesItsNewProductsFirst` → products are created by the inner
  resolver before `createPack` is reachable.
- `testCreatePackKeepsProductsCreatedBeforeTheFailure` → becomes a test that
  abandoning the form keeps what the inner resolver created.

No API, model, or repository changes. No OpenAPI regeneration — this uses the
five routes Phase 9 already exposed.

## Deliberately not built

- **A case inside a case.** Bounded by construction, not by a guard.
- **Editing a resolved content row's product.** Remove the row and re-add it;
  the row is a two-field thing and a swap is not worth its own mode.
- **Creating a case from scratch without scanning one.** `createPack` still
  requires a `pendingScan`, because the pack's `barcodes[]` comes from it.
- **Offline inner creates.** Same stance as the parent spec: an unknown code
  scanned without signal says so and the operator retries.
