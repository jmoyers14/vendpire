import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc, trpcClient } from "../trpc.ts";
import { ErrorNote, inputClass, Page } from "../components/ui.tsx";
import { parseDollarsToCents } from "../lib/money.ts";
import { CatalogSearch } from "../components/CatalogSearch.tsx";

interface FormState {
  name: string;
  packagings: { barcode: string; unitsPerPack: number | null }[];
  category: string;
  upc: string;
  taxClass: string;
  price: string;
  imageUrl: string | null;
  active: boolean;
}

const EMPTY: FormState = {
  name: "",
  packagings: [],
  category: "",
  upc: "",
  taxClass: "",
  price: "",
  imageUrl: null,
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
      packagings: product.packagings,
      price: String(product.defaultPriceCents / 100),
      imageUrl: product.imageUrl,
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

  const [lookingUp, setLookingUp] = useState(false);
  const lookup = async () => {
    setError(null);
    setLookingUp(true);
    try {
      const found = await trpcClient.products.lookupUpc.query({
        upc: form.upc.trim(),
      });
      if (!found) {
        setError("No catalog match for that UPC — enter details manually");
        return;
      }
      const name =
        found.name && found.brand && !found.name.includes(found.brand)
          ? `${found.brand} ${found.name}`
          : (found.name ?? form.name);
      setForm({
        ...form,
        // Prefill, but never clobber something already typed.
        name: form.name.trim() ? form.name : name,
        imageUrl: found.imageUrl ?? form.imageUrl,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLookingUp(false);
    }
  };

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
      packagings: form.packagings,
      imageUrl: form.imageUrl,
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
        <CatalogSearch
          onPick={(pick) =>
            setForm({
              ...form,
              name: pick.name,
              upc: pick.upc,
              imageUrl: pick.imageUrl ?? form.imageUrl,
            })
          }
        />
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
          <div className="flex gap-1">
            <input
              className={inputClass}
              placeholder="UPC"
              value={form.upc}
              onChange={(e) => set({ upc: e.target.value })}
            />
            <button
              type="button"
              onClick={lookup}
              disabled={lookingUp || !form.upc.trim()}
              title="Look up name + photo from the Open Food Facts catalog"
              className="shrink-0 rounded border border-primary-300 px-3 text-sm text-primary-600 hover:bg-primary-50 disabled:opacity-40"
            >
              {lookingUp ? "…" : "Look up"}
            </button>
          </div>
          <input
            className={inputClass}
            placeholder="Tax class (for CA vending rules)"
            value={form.taxClass}
            onChange={(e) => set({ taxClass: e.target.value })}
          />
        </div>
        {form.imageUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={form.imageUrl}
              alt={form.name || "Product"}
              className="h-16 w-16 rounded border border-grey-200 object-contain"
            />
            <button
              type="button"
              onClick={() => set({ imageUrl: null })}
              className="text-xs text-grey-500 hover:text-red-600"
            >
              Remove image
            </button>
          </div>
        ) : null}
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
