import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Button,
  buttonClass,
  EmptyState,
  ErrorNote,
  inputClass,
  labelClass,
  LoadMore,
  Page,
  PageTitle,
  TableScroll,
} from "../../ui.tsx";
import { formatCents } from "../../utils/money.ts";
import { queryClient, trpc } from "../../trpc.ts";
import {
  endOfLocalDayIso,
  type PresetId,
  presetRange,
  startOfLocalDayIso,
} from "./dateRange.ts";

const lineTotal = (lines: { totalCostCents: number }[]): number =>
  lines.reduce((sum, line) => sum + line.totalCostCents, 0);

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "90d", label: "Last 90 days" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom…" },
];

export function PurchasesScreen() {
  const [error, setError] = useState<string | null>(null);
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

  const remove = useMutation(
    trpc.purchases.remove.mutationOptions({
      onSuccess: () => {
        // pathKey(), not queryKey(): the list is stored under an INFINITE key
        // now, and queryKey() would no longer match it — silently, with no
        // type error.
        queryClient.invalidateQueries({
          queryKey: trpc.purchases.list.pathKey(),
        });
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

  const filtered = range.from !== null || range.to !== null;
  // Keyed off the preset rather than the resolved range, so picking Custom
  // before typing a date can't hide the control you'd use to get back.
  const showFilters = rows.length > 0 || preset !== "all";

  return (
    <Page max="4xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>
          Purchases
        </PageTitle>
        <Link
          to="/purchases/new"
          className={buttonClass({ size: "sm" })}
        >
          Log Purchase
        </Link>
      </div>

      <ErrorNote message={error} />

      {showFilters ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreset(id)}
                aria-pressed={preset === id}
                className={buttonClass({
                  size: "sm",
                  // Outline for the inactive siblings: they're equally valid
                  // choices, so only the current one carries a fill.
                  variant: preset === id ? "primary" : "outline",
                })}
              >
                {label}
              </button>
            ))}
          </div>

          {preset === "custom" ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex w-40 flex-col gap-1">
                <span className={labelClass}>From</span>
                <input
                  type="date"
                  className={inputClass}
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </label>
              <label className="flex w-40 flex-col gap-1">
                <span className={labelClass}>To</span>
                <input
                  type="date"
                  className={inputClass}
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </label>
              {customFrom || customTo ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setCustomFrom("");
                    setCustomTo("");
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {purchases.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : rows.length > 0 ? (
        <>
          <TableScroll>
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 font-medium">Items</th>
                  <th className="px-4 py-2 font-medium">Total</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-gray-100">
                    <td className="px-4 py-2 text-gray-800">
                      {new Date(purchase.purchasedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {purchase.vendor}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {purchase.lines.length} line(s)
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatCents(lineTotal(purchase.lines))}
                      {purchase.receiptTotalCents !== null &&
                      purchase.receiptTotalCents !== lineTotal(purchase.lines) ? (
                        <span
                          className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                          title={`Receipt says ${formatCents(purchase.receiptTotalCents)}`}
                        >
                          ≠ receipt
                        </span>
                      ) : null}
                    </td>
                    <td className="space-x-3 px-4 py-2 text-right">
                      <Link
                        to="/purchases/$purchaseId/edit"
                        params={{ purchaseId: purchase.id }}
                        className="text-primary-600 hover:text-primary-500"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove.mutate({ id: purchase.id })}
                        className="text-gray-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <LoadMore
            hasMore={purchases.hasNextPage}
            loading={purchases.isFetchingNextPage}
            onClick={() => void purchases.fetchNextPage()}
          />
        </>
      ) : filtered ? (
        <EmptyState>No purchases in that date range.</EmptyState>
      ) : (
        <EmptyState>
          No purchases yet. Click{" "}
          <span className="font-medium">Log Purchase</span> after your next
          Costco run.
        </EmptyState>
      )}
    </Page>
  );
}
