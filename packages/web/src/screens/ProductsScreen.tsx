import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page, TableScroll } from "../components/ui.tsx";
import { formatCents } from "../lib/money.ts";

export function ProductsScreen() {
  const [error, setError] = useState<string | null>(null);
  const products = useQuery(trpc.products.list.queryOptions());

  const remove = useMutation(
    trpc.products.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.products.list.queryKey(),
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
          Products
        </h1>
        <Link
          to="/products/new"
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
        >
          Add Product
        </Link>
      </div>

      <ErrorNote message={error} />

      {products.isLoading ? (
        <p className="text-grey-400">Loading…</p>
      ) : products.data && products.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-grey-200 bg-grey-50 text-left text-grey-600">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">UPC</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {products.data.map((product) => (
                <tr key={product.id} className="border-b border-grey-100">
                  <td className="px-4 py-2 font-medium text-grey-800">
                    {product.name}
                  </td>
                  <td className="px-4 py-2 text-grey-600">{product.category}</td>
                  <td className="px-4 py-2 text-grey-600">
                    {formatCents(product.defaultPriceCents)}
                  </td>
                  <td className="px-4 py-2 font-mono text-grey-600">
                    {product.upc ?? "—"}
                  </td>
                  <td className="space-x-3 px-4 py-2 text-right">
                    <Link
                      to="/products/$productId/edit"
                      params={{ productId: product.id }}
                      className="text-primary-600 hover:text-primary-500"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove.mutate({ id: product.id })}
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
          No products yet. Click{" "}
          <span className="font-medium">Add Product</span> to catalog what you
          sell.
        </div>
      )}
    </Page>
  );
}
