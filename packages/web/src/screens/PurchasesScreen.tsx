import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page, TableScroll } from "../components/ui.tsx";
import { formatCents } from "../lib/money.ts";

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
        <h1 className="font-heading text-xl font-bold text-grey-800">
          Purchases
        </h1>
        <Link
          to="/purchases/new"
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
        >
          Log Purchase
        </Link>
      </div>

      <ErrorNote message={error} />

      {purchases.isLoading ? (
        <p className="text-grey-400">Loading…</p>
      ) : purchases.data && purchases.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-grey-200 bg-grey-50 text-left text-grey-600">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Items</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {purchases.data.map((purchase) => (
                <tr key={purchase.id} className="border-b border-grey-100">
                  <td className="px-4 py-2 text-grey-800">
                    {new Date(purchase.purchasedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 font-medium text-grey-800">
                    {purchase.vendor}
                  </td>
                  <td className="px-4 py-2 text-grey-600">
                    {purchase.lines.length} line(s)
                  </td>
                  <td className="px-4 py-2 text-grey-600">
                    {formatCents(lineTotal(purchase.lines))}
                    {purchase.receiptTotalCents !== null &&
                    purchase.receiptTotalCents !== lineTotal(purchase.lines) ? (
                      <span
                        className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800"
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
                      className="text-grey-400 hover:text-red-600"
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
        <div className="rounded border border-dashed border-grey-300 p-8 text-center text-grey-600">
          No purchases yet. Click{" "}
          <span className="font-medium">Log Purchase</span> after your next
          Costco run.
        </div>
      )}
    </Page>
  );
}
