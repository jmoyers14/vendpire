import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { buttonClass, EmptyState, ErrorNote, Page, PageTitle, TableScroll } from "../../ui.tsx";
import { formatCents } from "../../utils/money.ts";
import { queryClient, trpc } from "../../trpc.ts";

const lineTotal = (lines: { totalCostCents: number }[]): number =>
  lines.reduce((sum, line) => sum + line.totalCostCents, 0);

export function PurchasesScreen() {
  const [error, setError] = useState<string | null>(null);
  const purchases = useQuery(trpc.purchases.list.queryOptions());

  const remove = useMutation(
    trpc.purchases.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.purchases.list.queryKey(),
        });
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

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

      {purchases.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : purchases.data && purchases.data.length > 0 ? (
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
              {purchases.data.map((purchase) => (
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
