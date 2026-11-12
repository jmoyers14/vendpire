import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ApiPurchase } from "../../apiTypes.ts";
import { trpc } from "../../trpc.ts";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  ChipGroup,
  type ChipOption,
  ErrorNote,
  Field,
  focusRing,
  LoadMore,
  Page,
  PageHeader,
  RowTable,
  RowTableBody,
  RowTableCellLabel,
  RowTableEmpty,
  RowTableHeader,
  RowTableRow,
  TextInput,
} from "../../ui.tsx";
import { formatShortDate } from "../../utils/dates.ts";
import { formatCents } from "../../utils/money.ts";
import { plural } from "../../utils/text.ts";
import {
  endOfLocalDayIso,
  type PresetId,
  presetRange,
  startOfLocalDayIso,
} from "./dateRange.ts";
import { isReceiptMismatch, linesTotalCentsFor, spentCentsFor } from "./purchaseTotals.ts";

const PRESETS: ChipOption<PresetId>[] = [
  { value: "month", label: "This month" },
  { value: "90d", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

/** Date · Vendor · Items · Total. */
const PURCHASE_COLUMNS = "112px minmax(0,1fr) 88px 168px";

export function PurchasesScreen() {
  // Defaults to the whole history: a filter that hides rows by default is a
  // filter you forget is on.
  const [preset, setPreset] = useState<PresetId>("all");
  // YYYY-MM-DD, straight off the date inputs. Converted to instants only on
  // the way into the query, so the inputs stay round-trippable.
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(() => {
    if (preset !== "custom") {
      return presetRange(preset, new Date());
    }
    return {
      from: customFrom ? startOfLocalDayIso(customFrom) : null,
      to: customTo ? endOfLocalDayIso(customTo) : null,
    };
  }, [preset, customFrom, customTo]);

  const purchases = useInfiniteQuery(
    trpc.purchases.list.infiniteQueryOptions(
      { from: range.from ?? undefined, to: range.to ?? undefined },
      {
        // Explicit so the first page's param is a value rather than undefined.
        initialCursor: null,
        // Null ends the list; the server's nextCursor is handed straight back.
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  // Changing the range changes the query key — tRPC strips cursor/direction
  // before keying — so a new filter is a new infinite query that starts at
  // page one. No manual reset, and no stale pages from the previous filter.
  const rows = purchases.data?.pages.flatMap((page) => page.items) ?? [];
  const isFiltered = range.from !== null || range.to !== null;

  return (
    <Page max="wide" className="grid gap-6">
      <PageHeader
        title="Purchases"
        meta="Every stock-buying run. What you paid sets the cost of goods behind each machine's profit."
        aside={
          <Link to="/purchases/new" className={buttonClass()}>
            Log purchase
          </Link>
        }
      />

      <Card className="grid gap-4 border border-line p-5">
        <ChipGroup
          label="Date range"
          isLabelVisible
          options={PRESETS}
          value={preset}
          onChange={setPreset}
        />
        {preset === "custom" ? (
          <div className="flex flex-wrap items-end gap-4">
            <Field label="From" className="w-44">
              <TextInput
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </Field>
            <Field label="To" className="w-44">
              <TextInput
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </Field>
            {customFrom || customTo ? (
              <Button
                variant="text"
                className="mb-1"
                onClick={() => {
                  setCustomFrom("");
                  setCustomTo("");
                }}
              >
                Clear dates
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      <ErrorNote message={purchases.error?.message ?? null} />

      {purchases.isLoading ? <p className="text-body text-muted-strong">Loading…</p> : null}

      {purchases.isSuccess ? (
        <>
          {rows.length > 0 ? (
            <SpendSummary purchases={rows} hasMore={purchases.hasNextPage} />
          ) : null}

          <RowTable columns={PURCHASE_COLUMNS} className="rounded-panel bg-card shadow-card">
            <RowTableHeader className="max-sm:hidden">
              <span>Date</span>
              <span>Vendor</span>
              <span className="text-right">Items</span>
              <span className="text-right">Total</span>
            </RowTableHeader>
            {rows.length > 0 ? (
              <RowTableBody>
                {rows.map((purchase) => (
                  <PurchaseRow key={purchase.id} purchase={purchase} />
                ))}
              </RowTableBody>
            ) : (
              <RowTableEmpty>
                {isFiltered
                  ? "No purchases in that date range."
                  : "No purchases yet. Log one after your next Costco run."}
              </RowTableEmpty>
            )}
          </RowTable>

          <LoadMore
            hasMore={purchases.hasNextPage}
            loading={purchases.isFetchingNextPage}
            onClick={() => void purchases.fetchNextPage()}
          />
        </>
      ) : null}
    </Page>
  );
}

/**
 * What the listed purchases add up to. The list arrives a page at a time, so
 * while more pages remain the figure covers only the ones loaded, and says so.
 */
function SpendSummary({
  purchases,
  hasMore,
}: {
  purchases: readonly ApiPurchase[];
  hasMore: boolean;
}) {
  const countLabel = plural(purchases.length, { one: "purchase", many: "purchases" });
  return (
    <section aria-label="Spent" className="grid gap-1">
      <p className="text-overline text-muted-strong uppercase">Spent</p>
      <p className="font-display text-stat text-ink tabular-nums">
        {formatCents(spentCentsFor(purchases))}
      </p>
      <p className="text-body-sm text-muted-strong">
        {hasMore
          ? `Across the first ${countLabel} only. Load more below to include the rest.`
          : `Across ${countLabel}.`}
      </p>
    </section>
  );
}

/** The vendor links to the edit page, which is also where a purchase is deleted. */
function PurchaseRow({ purchase }: { purchase: ApiPurchase }) {
  const linesTotalCents = linesTotalCentsFor(purchase);
  return (
    // On a phone: vendor and total on top, date and item count under them.
    <RowTableRow className="max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-1">
      <span className="text-body-sm text-ink max-sm:order-3 max-sm:text-muted-strong">
        <RowTableCellLabel>Date</RowTableCellLabel>
        {formatShortDate(purchase.purchasedAt)}
      </span>
      <Link
        to="/purchases/$purchaseId/edit"
        params={{ purchaseId: purchase.id }}
        className={`min-w-0 justify-self-start truncate rounded-sm text-label text-ink hover:text-link hover:underline max-sm:order-1 ${focusRing}`}
      >
        {purchase.vendor}
      </Link>
      <span className="text-right text-body-sm text-ink-soft tabular-nums max-sm:order-4 max-sm:text-muted-strong">
        <RowTableCellLabel>Items</RowTableCellLabel>
        {plural(purchase.lines.length, { one: "item", many: "items" })}
      </span>
      <span className="flex items-center justify-end gap-2 max-sm:order-2">
        {isReceiptMismatch(purchase) ? (
          <span
            title={`The items add up to ${formatCents(linesTotalCents)}, but the receipt says ${formatCents(purchase.receiptTotalCents)}`}
          >
            <Badge tone="warning" size="sm">
              ≠ receipt
            </Badge>
            <span className="sr-only">
              : the receipt says {formatCents(purchase.receiptTotalCents)}
            </span>
          </span>
        ) : null}
        <span className="font-mono text-mono text-ink tabular-nums">
          <RowTableCellLabel>Total</RowTableCellLabel>
          {formatCents(linesTotalCents)}
        </span>
      </span>
    </RowTableRow>
  );
}
