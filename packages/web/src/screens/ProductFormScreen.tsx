import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass, Page } from "../components/ui.tsx";
import { parseDollarsToCents } from "../lib/money.ts";

interface FormState {
  name: string;
  category: string;
  upc: string;
  taxClass: string;
  price: string;
  active: boolean;
}

const EMPTY: FormState = {
  name: "",
  category: "",
  upc: "",
  taxClass: "",
  price: "",
  active: true,
};

/** Create + edit form: `productId` present means edit. */
export function ProductFormScreen({ productId }: { productId?: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const existing = useQuery({
    ...trpc.products.get.queryOptions({ id: productId ?? "" }),
    enabled: Boolean(productId),
  });

  useEffect(() => {
    const product = existing.data;
    if (!product) {
      return;
    }
    setForm({
      name: product.name,
      category: product.category,
      upc: product.upc ?? "",
      taxClass: product.taxClass ?? "",
      price: String(product.defaultPriceCents / 100),
      active: product.active,
    });
  }, [existing.data]);

  const onSaved = () => {
    queryClient.invalidateQueries({ queryKey: trpc.products.list.queryKey() });
    navigate({ to: "/products" });
  };
  const create = useMutation(
    trpc.products.create.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );
  const update = useMutation(
    trpc.products.update.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.category.trim()) {
      setError("Name and category are required");
      return;
    }
    const defaultPriceCents = parseDollarsToCents(form.price);
    if (defaultPriceCents === null) {
      setError("Price must be a dollar amount (e.g. 1.75)");
      return;
    }
    const data = {
      name: form.name.trim(),
      category: form.category.trim(),
      upc: form.upc.trim() || null,
      taxClass: form.taxClass.trim() || null,
      defaultPriceCents,
      active: form.active,
    };
    if (productId) {
      update.mutate({ id: productId, ...data });
    } else {
      create.mutate(data);
    }
  };

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  return (
    <Page max="xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-bold text-grey-800">
          {productId ? "Edit Product" : "New Product"}
        </h1>
        <Link to="/products" className="text-sm text-grey-600 hover:text-grey-800">
          ← Back
        </Link>
      </div>

      <ErrorNote message={error} />

      <form onSubmit={submit} className="space-y-2">
        <input
          className={inputClass}
          placeholder="Name * (e.g. Doritos Nacho 1.75oz)"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className={inputClass}
            placeholder="Category * (e.g. chips)"
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Sell price in dollars * (e.g. 1.75)"
            value={form.price}
            onChange={(e) => set({ price: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            className={inputClass}
            placeholder="UPC"
            value={form.upc}
            onChange={(e) => set({ upc: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Tax class (for CA vending rules)"
            value={form.taxClass}
            onChange={(e) => set({ taxClass: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 pt-2 text-sm text-grey-700">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set({ active: e.target.checked })}
          />
          Active
        </label>
        <button
          type="submit"
          disabled={create.isPending || update.isPending}
          className="mt-2 rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
        >
          {productId ? "Save Changes" : "Create Product"}
        </button>
      </form>
    </Page>
  );
}
