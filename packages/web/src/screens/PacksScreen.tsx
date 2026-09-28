import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page, TableScroll } from "../components/ui.tsx";

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
          <h1 className="font-heading text-xl font-bold text-grey-800">Packs</h1>
          <p className="text-sm text-grey-500">
            How you buy products — cases, boxes, variety packs. Logging a
            purchase of a pack expands it into per-product units automatically.
          </p>
        </div>
        <Link
          to="/packs/new"
          className="shrink-0 rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
        >
          Add Pack
        </Link>
      </div>

      <ErrorNote message={error} />

      {packs.isLoading ? (
        <p className="text-grey-400">Loading…</p>
      ) : packs.data && packs.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-grey-200 bg-grey-50 text-left text-grey-600">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Contents</th>
                <th className="px-4 py-2 font-medium">Barcodes</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {packs.data.map((pack) => (
                <tr key={pack.id} className="border-b border-grey-100">
                  <td className="px-4 py-2 font-medium text-grey-800">
                    {pack.name}
                  </td>
                  <td className="px-4 py-2 text-grey-600">
                    {pack.contents
                      .map((content) => `${content.units} × ${productName(content.productId)}`)
                      .join(", ")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-grey-500">
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
          No packs yet. Click <span className="font-medium">Add Pack</span> to
          define a case or variety pack you buy.
        </div>
      )}
    </Page>
  );
}
