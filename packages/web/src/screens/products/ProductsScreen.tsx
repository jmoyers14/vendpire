import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  buttonClass,
  EmptyState,
  ErrorNote,
  Page,
  PageTitle,
  SearchInput,
  TableScroll,
} from "../../ui.tsx";
import { formatCents } from "../../utils/money.ts";
import { matchesSearch } from "../../utils/textMatch.ts";
import { queryClient, trpc } from "../../trpc.ts";

export function ProductsScreen() {
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const products = useQuery(trpc.products.list.queryOptions());

  const all = products.data ?? [];
  // Name, category and UPC — the three things on screen, so what you type
  // matches what you can see. The list stays in the server's name order;
  // filtering never reorders it.
  const rows = all.filter((product) =>
    matchesSearch(
      `${product.name} ${product.category} ${product.upc ?? ""}`,
      query,
    ),
  );

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
        <PageTitle>
          Products
        </PageTitle>
        <Link
          to="/products/new"
          className={buttonClass({ size: "sm" })}
        >
          Add Product
        </Link>
      </div>

      <ErrorNote message={error} />

      {all.length > 0 ? (
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search products"
          />
        </div>
      ) : null}

      {products.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : rows.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                <th className="w-12 px-4 py-2" />
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">UPC</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id} className="border-b border-gray-100">
                  <td className="px-2 py-1">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-9 w-9 rounded object-contain"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded bg-gray-100" />
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {product.name}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{product.category}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {formatCents(product.defaultPriceCents)}
                  </td>
                  <td className="px-4 py-2 font-mono text-gray-600">
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
      ) : all.length > 0 ? (
        <EmptyState>No products match “{query}”.</EmptyState>
      ) : (
        <EmptyState>
          No products yet. Click{" "}
          <span className="font-medium">Add Product</span> to catalog what you
          sell.
        </EmptyState>
      )}
    </Page>
  );
}
