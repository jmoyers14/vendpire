import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { trpc } from "../../trpc.ts";

/**
 * Looks up a product's name by id from the catalog. "…" until the catalog
 * loads, then "Unknown product" for an id it doesn't have, never the raw id.
 */
export const useProductName = (): ((productId: string) => string) => {
  const products = useQuery(trpc.products.list.queryOptions());
  return useMemo(() => {
    if (!products.data) {
      return () => "…";
    }
    const names = new Map(products.data.map((product) => [product.id, product.name]));
    return (productId: string) => names.get(productId) ?? "Unknown product";
  }, [products.data]);
};
