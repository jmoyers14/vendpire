# iOS purchase logging + scanner (Phase 9)

Log a stock-buying run on the phone: scan items with VisionKit, resolve every known
barcode against the local mirror with no network, give unknown codes a first-class
attach-or-create path, and submit the draft through the Phase 8 outbox.
`PurchaseService` stays the single recorder — the phone gets a second door into the
same write path, never a second implementation of it.

**Prerequisite:** the `visit-review` branch merges to main first. It touches
`OutboxSubmitter.swift`, the VisitCapture screens, and the outbox review surface this
phase extends; starting after it lands avoids a messy pbxproj merge.

## What the phone mirrors, and what it reuses

The web `PurchaseFormScreen` flow is the template: one scan-or-search entry point,
rows that read like a receipt (one total cost per line), live pack-split preview,
receipt reconciliation, and a not-found panel that offers attach before create.

The split of responsibilities is unchanged from the web:

- **Server owns every fact.** Pack expansion (`expandPackLines` →
  `allocateProportionally`), reference validation, barcode uniqueness,
  `clientRequestId` idempotency. iOS submits `lines` + `packLines` and never splits a
  cost itself.
- **Client owns entry ergonomics.** Scan routing, catalog search ranking, split
  preview, variance display.

### The resolution policy, relocated

`BarcodeResolverServiceImpl`'s precedence is preserved exactly; the first two steps
move on-device where they work offline:

1. `normalizeGtin` — the Swift port from Phase 2, pinned to the shared
   `vectors.json`.
2. Own catalog wins: mirror product by `upc`, then mirror pack by `barcodes[]`.
   A hit becomes a row with zero network. Rescanning the same code increments the
   existing row.
3. Only a miss consults the server: `GET /api/v1/barcode-candidate?code=` returns
   what Open Food Facts guesses — a candidate, prefill-only, never auto-created.
4. A failed or offline candidate lookup degrades to the not-found sheet with no
   "Maybe" card. It never blocks entry.

`barcodes.resolve` stays off the REST surface — the Phase 6 decision holds, and the
DECIDE left open on the Phase 9 card is now resolved: every arm of that union except
"candidate" is answered locally, so only the flat candidate endpoint is exposed.

### Vocabulary: catalog vs candidate

**Catalog** means the set of products and packs the operator has built — the web
purchase screen already uses it that way (`catalogSearch.ts`). The API layer
wrongly calls Open Food Facts "the external catalog"; that ends here.

**Candidate** is the term for an unverified external identification of a barcode.
Considered: `suggestion`, `guess`. Kept `candidate` — it is already the resolver arm
(`status: "candidate"`) and the web type (`CatalogCandidate`), it is the
record-matching term of art, and the rename cost of switching bought no clarity.

Consequence: `products.lookupUpc` and `products.searchCatalog` move to a
`candidates` router (`candidates.byUpc`, `candidates.search`), and doc comments stop
calling the outside database a catalog. Web call sites update; `CatalogCandidate`
and the resolver arm stay as they are.

## Backend work (all in `packages/api`)

Five REST exposures, one rename, one small pair of service methods. No model,
repository, or `PurchaseService` changes.

| Route | Procedure | Notes |
|---|---|---|
| `GET /api/v1/barcode-candidate` | `candidates.byUpc` | New flat output schema: nullable `{name, brand, imageUrl}` |
| `POST /api/v1/products` | `products.create` | Reuses `productDto` output |
| `POST /api/v1/packs` | `packs.create` | Reuses `packDto` output |
| `PUT /api/v1/products/{id}/barcode` | `products.attachBarcode` | New narrow mutation — `id` rides the path, body is `{code}` |
| `PUT /api/v1/packs/{id}/barcode` | `packs.attachBarcode` | New narrow mutation — `id` rides the path, body is `{code}` |

- **Attach is a narrow mutation, not a full-record update.** The phone would
  otherwise send its mirror copy with one field changed; a stale mirror would
  silently revert a concurrent web edit (a rename, a price change). `attachBarcode`
  touches only the code: products set `upc`, packs append to `barcodes[]`. Both
  reuse the existing org-wide uniqueness validation — these are the only new
  service methods in the phase.
- Every exposure follows the Phase 6 recipe: `.meta({ openapi })`, explicit
  annotated `.output(...)`, regenerate the committed `openapi/vendpire.yaml`
  (CI already fails on a stale spec), and extend the parsed-document/Ajv tests —
  verify by parsing, never by grepping the YAML.
- All new schemas are flat. Nothing reintroduces a `oneOf` for
  `swift-openapi-generator` to fight.

### The stale-mirror backstop

The device's "own catalog" is the mirror, and a mirror can lag. The guard is where
it cannot be bypassed: `ProductServiceImpl` and `PackServiceImpl` reject any create
or attach whose code already exists in the org, naming the holder
(`Barcode … is already on "Coke Zero"`). The phone surfaces that message with a
one-tap "use that instead," which lands on the attach outcome the operator wanted.

Deliberately **no** refresh-on-miss: at a Costco run full of genuinely new items,
every miss is real and the refreshes would find nothing. The only refresh trigger is
opening the purchase screen.

## iOS work

### Entry and screen anatomy

"Log Purchase" is a toolbar action on the location list — the app's root screen —
because purchases are not machine-scoped and must not live inside the
location → machine drill-down. Opening the screen fires the one mirror
refresh and mints the `clientRequestId` — the web precedent: minted once, so a
double-tap of Save cannot write twice.

The screen, top to bottom: date (defaults today, stored at local midday — the same
`T12:00:00` anchoring the web uses), vendor (defaults "Costco"), Scan button, line
list, receipt reconciliation, notes, Save. Manual add ("item or pack without a
barcode") opens a searchable picker over the mirror.

### Scanning

VisionKit `DataScannerViewController`, continuous: the scanner stays up while the
operator works through a cart — scan, scan, scan. Each code runs the resolution
policy above; known items appear as rows (or increment) without leaving the scanner.
An unknown code drops into the not-found sheet.

### The not-found sheet (full parity with the web panel)

The candidate renders as a visually separate "Maybe" card — a suggestion about the
world, not a fact about the catalog. The operator explicitly picks a way out;
neither is defaulted, because a duplicate is the expensive mistake (CSV-imported
products arrived with no barcodes — the scanned thing often already exists under a
recognizable name):

- **Attach** — search the mirror by name (the ported ranking below); picking a
  product or pack calls the narrow attach endpoint.
- **Create** — kind preset from `likelyCase` (off the local `normalizeGtin` result,
  so the preset works with no network). A unit takes name / category /
  optional vend price (empty means "decide later", not zero), prefilled from the
  candidate. A case takes a contents editor with full parity: each content line is
  an existing product or a new one created inline with its own bag code (validated
  by `normalizeGtin` locally, always distinct from the scanned case code).
  Single-product cases auto-suggest their name until the field is edited.
- Partial failure keeps the web's stance: products created before a pack failure
  stay — they are records the operator wanted, and a rerun picks them from the
  list instead of duplicating.

Every successful attach or create **upserts into the mirror immediately**, so that
code resolves locally from then on, and the new record is usable in the same draft.

### Ported pure logic (small, each tested)

- **Catalog search ranking** — the `catalogSearch.ts` semantics: name-only, every
  term must match, position-scored (exact < prefix < word-start < mid-word), ties
  break to the shorter name.
- **`allocateProportionally`** — ported for the pack-split *preview only*, pinned
  by a shared `vectors.json` generated from the TypeScript tests (the `normalizeGtin`
  precedent). The server's expansion stays authoritative; the preview exists because
  typing a $37.98 variety case without seeing the split invites exactly the errors
  reconciliation is meant to catch.
- **Row/money validation** and the variance arithmetic (entered minus receipt).

### Save path

Save encodes the draft — `{purchasedAt, vendor, lines, packLines,
receiptTotalCents, notes, clientRequestId}` — as the app's **own stable `Codable`
shape** with a `schemaVersion` (per the Phase 8 outbox spec's correction: never
frozen generated wire bytes; migration over freezing), enqueues
`OutboxItem(kind: "purchase", id == clientRequestId)`, and dismisses. There is no
separate draft entity — the payload is the persisted state, and the submitter
already deletes drafts by id only, so a purchase simply has none.

`OutboxSubmitter` is untouched. The one change is at the network edge
(`VendpireAPIClient+Outbox.swift`): a `kind` switch decodes purchase payloads and
calls the generated `createPurchase`, mapping responses through the same Phase 8
failure table (retryable backoff for network/5xx/429; 401 re-auths once and never
drops; 400/404 → `needsAttention` with the server's message; an idempotent 200
returning the existing purchase is success). An unrecognized `kind` — an old app
meeting a future item — goes to `needsAttention`, never dropped, never a crashed
drain.

The queue stays serial, oldest first, stop on first retryable failure. Purchases do
not need visits' ordering protection, but one rule for the whole queue beats a
special case — a retryable failure means connectivity is bad for everything behind
it too.

Pending purchases appear in the existing outbox review surface, labeled by vendor
and entered total, with the same `needsAttention` affordance as visits. A purchase
in `needsAttention` has no edit-in-place in v1 (there is no draft entity to reopen):
the operator reads the server's message, explicitly discards the item, and logs the
purchase again. Discard is always an explicit act — nothing is silently deleted.

## Error handling summary

| Failure | Behavior |
|---|---|
| Candidate lookup fails / offline | Not-found sheet without the Maybe card; entry never blocks |
| Create/attach rejected: code already in org | Show the server's message (it names the holder) with one-tap attach-instead |
| Create/attach network failure | Error in the sheet; operator retries — nothing partial is enqueued |
| Submit failures | Phase 8 classification table, unchanged |
| Unknown outbox `kind` | `needsAttention`, never dropped |

## Testing

- **Swift** (run on a device — the Simulator falsely passes): resolution decision
  tree against an in-memory mirror (product hit, pack hit, miss, product-beats-pack
  precedence); `allocateProportionally` against the shared vectors; draft encode /
  decode stability under `schemaVersion`; the network-edge kind dispatch; search
  ranking; row validation and variance.
- **API**: service tests for both `attachBarcode` methods including uniqueness
  rejections; parsed-document/Ajv assertions for the five new routes; the committed
  YAML regeneration check.
- **E2E**: create a purchase over REST → resend the same `clientRequestId` → assert
  exactly one document.
- **Field test**: log one of the real pending purchases from the phone — the point
  of the phase.

## Docs (the "then docs" half of the phase)

- `README.md:13-14`: correct the phase numbering; add an `ios/` row to the packages
  table.
- `docs/diagrams/visit-capture.md` — alongside `webhook-ingestion.md` and
  `barcode-resolution.md`.
- `docs/runbooks/stuck-outbox.md` — a draft stuck in `needsAttention`, a lapsed
  Clerk session with pending items, and how to confirm a submission landed exactly
  once.

## Deliberately not built

- **Exposing `barcodes.resolve`** — resolved: local resolution + the flat candidate
  endpoint cover every arm.
- **Offline creation** — no provisional local products, no creation outbox.
  Logging assumes signal (Costco, the car, home); an unknown code scanned offline
  shows "needs signal" on the sheet and the operator retries when coverage returns.
  The purchase submit itself remains fully offline-safe.
- **Refresh-on-miss** — see the stale-mirror backstop.
- **Editing purchases on the phone** — the phone is append-only capture, as with
  visits. Edits stay on web, where the stored expanded lines are shown.
- **Receipt OCR, totals scanning, vendor lookup** — out of scope.
