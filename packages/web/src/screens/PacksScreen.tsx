import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { buttonClass, EmptyState, ErrorNote, Page, PageTitle, TableScroll } from "../components/ui.tsx";
import { queryClient, trpc } from "../trpc.ts";

export function PacksScreen() {
  const [error, setError] = useState<string | null>(null);
  const packs = useQuery(trpc.packs.list.queryOptions());
  const products = useQuery(trpc.products.list.queryOptions());

  const productName = (id: string): string =>
    products.data?.find((product) => product.id === id)?.name ?? "…";

  const remove = useMutation(
    trpc.packs.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.packs.list.queryKey() });
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

  return (
    <Page max="4xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <PageTitle>Packs</PageTitle>
          <p className="text-sm text-gray-500">
            How you buy products — cases, boxes, variety packs. Logging a
            purchase of a pack expands it into per-product units automatically.
          </p>
        </div>
        <Link
          to="/packs/new"
          className={buttonClass({ size: "sm", className: "shrink-0" })}
        >
          Add Pack
        </Link>
      </div>

      <ErrorNote message={error} />

      {packs.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : packs.data && packs.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Contents</th>
                <th className="px-4 py-2 font-medium">Barcodes</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {packs.data.map((pack) => (
                <tr key={pack.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {pack.name}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {pack.contents
                      .map((content) => `${content.units} × ${productName(content.productId)}`)
                      .join(", ")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {pack.barcodes.join(", ") || "—"}
                  </td>
                  <td className="space-x-3 px-4 py-2 text-right">
                    <Link
                      to="/packs/$packId/edit"
                      params={{ packId: pack.id }}
                      className="text-primary-600 hover:text-primary-500"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove.mutate({ id: pack.id })}
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
          No packs yet. Click <span className="font-medium">Add Pack</span> to
          define a case or variety pack you buy.
        </EmptyState>
      )}
    </Page>
  );
}
