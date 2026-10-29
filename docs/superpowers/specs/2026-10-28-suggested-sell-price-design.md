# Suggested sell price

What you paid per unit, surfaced where you set the price. The first purchase is
in and the catalog has prices that were guesses; nothing in the app yet tells
you whether any of them clears cost.

The calculation is not the work. `domain/src/costs/unitCost.ts` has already
derived weighted-average unit cost since Phase 8, and
`PurchaseRepository.findCostBasisLines` already feeds it. The engine's only
consumer is `VisitServiceImpl` computing visit P&L — the number exists, is
tested, and has never once been on screen. This spec is about exposure.

## Replacement cost, not the average

The existing basis is an **all-time weighted average per product**, and
`unitCost.ts` is emphatic about why: a receipt entered three weeks late has to
retroactively correct COGS, which is also why `Product.ts` refuses to store a
cost at all.

That is the right number for COGS and the wrong number for pricing. Pricing asks
*what will it cost me to buy this again?* — and the moment Costco changes a case
price, the all-time average starts dragging a stale number forward for as long
as the product has history.

So this introduces a second, narrower basis: **the most recent purchase line for
the product.** Two bases, two purposes, no contention —

| | basis | corrects | used by |
|---|---|---|---|
| `unitCost.ts` | all-time weighted average | history, retroactively | visit P&L, COGS |
| `suggestedPrice.ts` | latest purchase line | the forward decision | the pricing suggestion |

Nothing in `unitCost.ts` changes.

## The rule

```
suggested = ceilToQuarter(replacementUnitCost × 3.0)
```

**3.0× hardcoded** as `TARGET_MARKUP` in the domain, not an org setting. There
is one operator; if 3.0 is wrong that is a one-line change and the feedback loop
is a week. Revisit when a second org disagrees — `Organization.ts` is already
documented as the place to hang business-level settings, so the move is cheap
when it is warranted.

**Rounded up to the nearest $0.25.** Quarters are what coin mechs take and what
vending prices read as. Rounding *up* rather than to-nearest means the
suggestion never lands under the markup it claims.

| cost | × 3.0 | suggest |
|---|---|---|
| 0.33 | 0.99 | 1.00 |
| 0.55 | 1.65 | 1.75 |
| 0.58 | 1.74 | 1.75 |
| 0.72 | 2.16 | 2.25 |
| 1.10 | 3.30 | 3.50 |

## `domain/src/costs/suggestedPrice.ts`

A new pure module beside `unitCost.ts`, exported from the barrel.

```ts
export const TARGET_MARKUP = 3.0;
export const PRICE_INCREMENT_CENTS = 25;

/** One purchase line, carrying when and from whom. */
export interface ReplacementCostLine {
  readonly productId: string;
  readonly purchaseId: string;
  readonly units: number;
  readonly totalCostCents: Cents;
  readonly purchasedAt: string;
  readonly vendor: string;
}

/** The latest line for one product — what it costs to buy again. */
export interface ReplacementCost {
  readonly units: number;
  readonly totalCostCents: Cents;
  readonly purchasedAt: string;
  readonly vendor: string;
}

buildReplacementCosts(lines): Map<string, ReplacementCost>
replacementCostCentsForDisplay(cost): Cents
suggestedPriceCents(cost): Cents
markupAtPrice(priceCents, cost): number
marginFractionAtPrice(priceCents, cost): number
```

Three conventions carried over from `unitCost.ts`, because the two modules sit
next to each other and should not need separate rules in the reader's head.

**Keep the fraction; divide at the end.** `ReplacementCost` stores `units` and
`totalCostCents` rather than a unit cost, and every function divides once. The
coarse ceiling absorbs most rounding drift in the suggestion itself, so this is
discipline rather than a bug fix — but `markupAtPrice` and
`marginFractionAtPrice` are not rounded to quarters, and keeping the fraction
means neither they nor a future change to `TARGET_MARKUP` or
`PRICE_INCREMENT_CENTS` can reintroduce the question.

**The `ForDisplay` suffix carries the same warning it does today.**
`replacementCostCentsForDisplay` is the "$0.58 each" number and must never be
multiplied by a unit count. COGS has `cogsForUnits` and a different basis.

**Absence, never zero.** A product with no purchases is *absent* from the map,
exactly as `buildCostBasis` leaves it absent rather than present with a zero.
The UI renders "—" and offers no suggestion. A fresh catalog is mostly this.

### Two edge rules

**`units <= 0` cannot be a basis.** Those lines are skipped during the build, so
a zero-unit line can never become the divisor. If every line for a product is
skipped the product is absent, which is the honest answer.

**Ties on `purchasedAt` break on `purchaseId` descending.** `purchasedAt` is not
unique — the `Purchase` index comments already say several supply runs share a
date — so the latest-line rule needs a second key or entering two receipts for
one day is non-deterministic. `purchaseId` is on the line for that reason alone,
and it makes `buildReplacementCosts` independent of input order and therefore
testable without a Mongo harness.

A zero-cost line (a free sample) is kept: paying nothing is a fact worth showing.
`suggestedPriceCents` returns 0 for it and the UI suppresses a $0.00 suggestion.

## `PurchaseRepository.findReplacementCostLines(orgId)`

A sibling to `findCostBasisLines`: the same flattened, unpaginated all-lines
read, projected to the five fields pricing needs. It carries `purchasedAt`,
`vendor` and the purchase `_id`, which COGS has no use for.

`findCostBasisLines` is **not** modified. Leaving the P&L read path untouched is
worth one more projected query, and the two reads named as siblings say plainly
that there are two bases.

The unpaginated shape inherits the existing justification: the all-time average
cannot be windowed without breaking late-receipt correction, and the same read
is already affordable on every visit computation.

The alternative is a `$unwind` / `$sort` / `$group` aggregation returning only
the latest line per product. Tighter as history grows, but it moves the tiebreak
rule out of a pure function and into a query that needs the integration harness
to test. Worth doing when purchase volume makes the full read hurt; not now.

## `products.pricing`

A new tRPC query:

```ts
{ productId, lastPaid: { unitCostCents, purchasedAt, vendor } | null,
  suggestedPriceCents: number | null }[]
```

The client joins to products by `productId`.

**Not folded into `products.list`.** `schemas/product.ts` pins the DTO to the
platform `Product` type with an `Assert<Equal<>>`, and cost is deliberately not
on that model. Extending the DTO would mean either breaking that test or putting
a derived number on the product, which is the thing `Product.ts` exists to
refuse.

**No `openapi` meta.** This is a web surface; the iOS mirror does not price
products. `/api/v1` and the generated OpenAPI document are unchanged.

### `PricingService`

A thin service with `PurchaseRepository` injected, registered on
`PRICING_SERVICE_TOKEN` alongside the others in `services/index.ts` and exposed
on the context in `createContext.ts`.

```ts
export interface PricingService {
  list(orgId: string): Promise<ProductPricing[]>;
}
```

One method today. It is the obvious home for the post-purchase repricing nudge
(out of scope below), which is why this is not a method bolted onto
`ProductService` — that would need `PurchaseRepository` injected into a service
that otherwise only reads products.

## The product form hint

Under the existing default-price field in `ProductFormScreen`. **Edit-only** — a
product being created has no purchase history by definition, so there is nothing
to suppress and no empty state to design.

```
Default price
┌──────────────┐
│ $ 1.50       │
└──────────────┘
Last paid $0.58/unit · Costco, Oct 24
Suggest $1.75 (3.0×)        [ Use $1.75 ]
At $1.50 you keep $0.92 — 61% margin
```

**The last line recomputes as you type.** That is what makes this a pricing tool
rather than a readout: you can try $1.50 against $1.75 and watch the margin
move, which is the actual decision. It reads from the form's `price` state
through `parseDollarsToCents`, so it follows the field, not the saved value.

`[ Use $1.75 ]` writes the suggestion into the field; it does not save.

The whole block is absent when the product has no purchases, and the suggestion
alone is absent when the suggestion would be $0.00.

## The products list

`ProductsScreen` gains Cost, Margin and Suggest beside the existing Price.

```
Product          Cost   Price  Margin  Suggest
Cheez-It 2oz     0.58   1.50    61%    1.75 ⚠
Coke 12oz        0.33   1.25    73%    1.00
Doritos 2.5oz    0.55   1.75    69%    1.75
Snickers         0.72   1.50    52%    2.25 ⚠
Gum 15ct          —     1.00     —      —
```

This is the screen that answers "which of the things I just entered are priced
wrong?". ⚠ marks a row whose current price is under the 3.0× target.

Three columns means raising the table's `min-w` from `36rem` to about `52rem`.
`TableScroll` already handles the overflow, so narrow screens scroll rather than
break. The alternative — folding UPC under the product name as a secondary mono
line to buy the width back — is deliberately not taken here: it changes a column
this feature has no business touching.

**No sorting.** The list is in server name order and the existing comment
promises filtering never reorders it. The ⚠ marker is enough to scan a catalog
this size, and sorting is a separate decision about the whole table.

Row shaping lives in `screens/products/pricing.ts` with a unit test, mirroring
`screens/visits/pnlRows.ts`. It joins products to pricing and derives the
per-row display values; the arithmetic itself stays in the domain so web and any
future caller cannot drift.

## Where it lives

| | |
|---|---|
| `domain/src/costs/suggestedPrice.ts` | the basis, the rule, the constants |
| `domain/src/index.ts` | barrel export |
| `platform/.../PurchaseRepository.ts` + `Impl` | `findReplacementCostLines` |
| `api/src/services/PricingService/` | interface + impl |
| `api/src/services/{tokens,index}.ts`, `createContext.ts`, `context.ts` | wiring |
| `api/src/routers/products.ts` | the `pricing` query |
| `api/src/services/test-support/fakes.ts` | the new repository method |
| `web/src/screens/products/pricing.ts` | row shaping |
| `web/src/screens/products/ProductsScreen.tsx` | three columns |
| `web/src/screens/products/ProductFormScreen.tsx` | the hint |

No schema change, no migration, nothing persisted.

## Tests

Domain, pure:

- The latest line wins over an earlier one with a different unit cost — the
  whole point of the second basis
- A product with no purchases is absent from the map, not zero
- A `units: 0` line is skipped rather than dividing by zero; a product whose only
  line has zero units is absent
- Two lines sharing a `purchasedAt` resolve on `purchaseId`, and the result does
  not depend on input order
- `suggestedPriceCents` rounds up to a quarter and never lands below
  `TARGET_MARKUP` — asserted across the worked table above
- `markupAtPrice` and `marginFractionAtPrice` agree with the suggestion at the
  suggested price

Repository, integration:

- `findReplacementCostLines` returns every live line with its purchase date,
  vendor and id, excludes soft-deleted purchases, and is org-scoped — the three
  properties `findCostBasisLines` is already tested for

Web, pure:

- A row with no purchase renders dashes in all three derived columns
- The under-target flag is set below 3.0× and clear at or above it

## Out of scope

The planogram slot editor, where per-cell `priceCents` is what the machine
actually charges — a considered deferral, not an oversight; the product default
is where the number is set today.

The post-purchase repricing nudge ("this receipt changed cost on 8 products; 3
are now under target") · a tunable target markup and its settings UI · sorting
the products table · surfacing any of this to iOS · writing a price back from the
suggestion without an explicit click.
