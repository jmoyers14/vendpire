import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { ApiProduct, ApiProductPricing } from "../../apiTypes.ts";
import {
  Badge,
  buttonClass,
  ErrorNote,
  focusRing,
  Page,
  PageHeader,
  RowTable,
  RowTableBody,
  RowTableEmpty,
  RowTableHeader,
  RowTableRow,
  SearchInput,
} from "../../ui.tsx";
import { formatShortDate } from "../../utils/dates.ts";
import { formatCents, formatPercent } from "../../utils/money.ts";
import { matchesSearch } from "../../utils/textMatch.ts";
import { trpc } from "../../trpc.ts";
import { buildPricingDisplay, type PricingDisplay } from "./pricing.ts";

/** Photo · Product · Last paid · Default price · Suggest. */
const PRODUCT_COLUMNS = "40px minmax(0,1fr) 150px 130px 120px";

/**
 * The catalog, read for one job: what a unit costs you against what you charge,
 * so you can set a machine price.
 */
export function ProductsScreen() {
  const [query, setQuery] = useState("");
  const productsQuery = useQuery(trpc.products.list.queryOptions());
  const pricingQuery = useQuery(trpc.products.pricing.queryOptions());

  const catalog = productsQuery.data ?? [];
  // Name, category and UPC: what you'd type to find a product. The list stays
  // in the server's name order; filtering never reorders it.
  const matches = catalog.filter((product) =>
    matchesSearch(`${product.name} ${product.category} ${product.upc ?? ""}`, query),
  );
  const pricingByProduct = new Map(
    (pricingQuery.data ?? []).map((pricing) => [pricing.productId, pricing]),
  );
  const emptyMessage =
    catalog.length > 0
      ? `No products match “${query}”.`
      : "No products yet. Add one to start cataloging what you sell.";

  return (
    <Page max="wide" className="grid gap-6">
      <PageHeader
        title="Products"
        meta={
          productsQuery.isLoading
            ? undefined
            : "What each unit costs you, against the price you charge."
        }
        aside={
          <Link to="/products/new" className={buttonClass()}>
            Add product
          </Link>
        }
      />

      <ErrorNote message={productsQuery.error?.message ?? null} />
      <ErrorNote
        message={pricingQuery.error ? `Couldn't load costs: ${pricingQuery.error.message}` : null}
      />

      {catalog.length > 0 ? (
        <div className="w-full sm:max-w-sm">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, category or UPC"
          />
        </div>
      ) : null}

      {productsQuery.isLoading ? (
        <p className="text-body text-muted-strong">Loading…</p>
      ) : null}
      {productsQuery.isSuccess ? (
        <RowTable
          columns={PRODUCT_COLUMNS}
          minWidth="640px"
          // The boxed table draws the border; this adds the card's fill and shadow behind it.
          className="rounded-panel bg-card shadow-card"
        >
          <RowTableHeader>
            <span />
            <span>Product</span>
            <span className="text-right">Last paid</span>
            <span className="text-right">Default price</span>
            <span>Suggest</span>
          </RowTableHeader>
          {matches.length > 0 ? (
            <RowTableBody>
              {matches.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  pricing={pricingByProduct.get(product.id)}
                  isPricingLoading={pricingQuery.isLoading}
                />
              ))}
            </RowTableBody>
          ) : (
            <RowTableEmpty>{emptyMessage}</RowTableEmpty>
          )}
        </RowTable>
      ) : null}
    </Page>
  );
}

/**
 * One product. The name links to its edit page. Margin and the suggestion are
 * worked out from the last price paid.
 */
function ProductRow({
  product,
  pricing,
  isPricingLoading,
}: {
  product: ApiProduct;
  pricing: ApiProductPricing | undefined;
  isPricingLoading: boolean;
}) {
  const pricingDisplay = pricing ? buildPricingDisplay(pricing, product.defaultPriceCents) : null;
  // A $0 price is never "under target" by the markup rule, but it needs a price most of all.
  const shouldSuggest =
    pricingDisplay !== null &&
    pricingDisplay.suggestedPriceCents !== null &&
    (pricingDisplay.isUnderTarget || product.defaultPriceCents === 0);

  return (
    <RowTableRow>
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="size-10 rounded-control object-contain" />
      ) : (
        <span aria-hidden className="size-10 rounded-control bg-divider" />
      )}
      <div className="min-w-0">
        <Link
          to="/products/$productId/edit"
          params={{ productId: product.id }}
          className={`rounded-sm text-label text-ink hover:text-link hover:underline ${focusRing}`}
        >
          {product.name}
        </Link>
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted-strong">
          {product.category}
          {product.active ? null : (
            <Badge size="sm" tone="neutral">
              Inactive
            </Badge>
          )}
        </p>
      </div>
      <LastPaidCell
        pricing={pricing}
        unitCostCents={pricingDisplay?.unitCostCents ?? null}
        isLoading={isPricingLoading}
      />
      <PriceCell priceCents={product.defaultPriceCents} pricingDisplay={pricingDisplay} />
      <div>
        {shouldSuggest && pricingDisplay?.suggestedPriceCents ? (
          <Badge size="sm" tone="warning">
            <span className="sr-only">Suggested price: </span>
            Try&nbsp;
            <span className="font-mono tabular-nums">
              {formatCents(pricingDisplay.suggestedPriceCents)}
            </span>
          </Badge>
        ) : null}
      </div>
    </RowTableRow>
  );
}

/** The header is visual only, so each cell names itself for screen readers. */
const CellLabel = ({ children }: { children: string }) => (
  <span className="sr-only">{children}: </span>
);

/** What one unit cost on the latest purchase, and where and when. */
function LastPaidCell({
  pricing,
  unitCostCents,
  isLoading,
}: {
  pricing: ApiProductPricing | undefined;
  unitCostCents: number | null;
  isLoading: boolean;
}) {
  if (!pricing || unitCostCents === null) {
    return (
      <div className="text-right">
        <p className="font-mono text-mono tabular-nums text-muted">
          <CellLabel>Last paid</CellLabel>—
        </p>
        {/* Saying "not bought yet" before the costs arrive would be wrong for most rows. */}
        {isLoading ? null : <p className="text-body-sm text-muted-strong">Not bought yet</p>}
      </div>
    );
  }
  return (
    <div className="text-right">
      <p className="font-mono text-mono tabular-nums text-ink">
        <CellLabel>Last paid</CellLabel>
        {formatCents(unitCostCents)}
      </p>
      <p className="text-body-sm text-muted-strong">
        {pricing.vendor} · {formatShortDate(pricing.purchasedAt)}
      </p>
    </div>
  );
}

/** The default price, and the margin it makes over the last price paid. */
function PriceCell({
  priceCents,
  pricingDisplay,
}: {
  priceCents: number;
  pricingDisplay: PricingDisplay | null;
}) {
  const marginFraction = pricingDisplay?.marginFraction ?? null;
  return (
    <div className="text-right">
      <p className="font-mono text-mono tabular-nums text-ink">
        <CellLabel>Default price</CellLabel>
        {formatCents(priceCents)}
      </p>
      {marginFraction !== null ? (
        <p
          className={`text-body-sm font-bold ${pricingDisplay?.isUnderTarget ? "text-warning" : "text-profit"}`}
        >
          <span className="font-mono tabular-nums">{formatPercent(marginFraction)}</span> margin
        </p>
      ) : null}
    </div>
  );
}
