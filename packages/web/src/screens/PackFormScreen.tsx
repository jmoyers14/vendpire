import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass, Page } from "../components/ui.tsx";

interface ContentRow {
  productId: string;
  units: string;
}

const EMPTY_CONTENT: ContentRow = { productId: "", units: "" };

/** Create + edit form: `packId` present means edit. */
export function PackFormScreen({ packId }: { packId?: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [barcodesText, setBarcodesText] = useState("");
  const [contents, setContents] = useState<ContentRow[]>([{ ...EMPTY_CONTENT }]);

  const products = useQuery(trpc.products.list.queryOptions());
  const existing = useQuery({
    ...trpc.packs.get.queryOptions({ id: packId ?? "" }),
    enabled: Boolean(packId),
  });

  useEffect(() => {
    const pack = existing.data;
    if (!pack) {
      return;
    }
    setName(pack.name);
    setBarcodesText(pack.barcodes.join(", "));
    setContents(
      pack.contents.map((content) => ({
        productId: content.productId,
        units: String(content.units),
      })),
    );
  }, [existing.data]);

  const onSaved = () => {
    queryClient.invalidateQueries({ queryKey: trpc.packs.list.queryKey() });
    navigate({ to: "/packs" });
  };
  const create = useMutation(
    trpc.packs.create.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );
  const update = useMutation(
    trpc.packs.update.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(e.message),
    }),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const parsed = [];
    for (const [index, row] of contents.entries()) {
      if (!row.productId && !row.units) {
        continue;
      }
      const units = Number.parseInt(row.units, 10);
      if (!row.productId || Number.isNaN(units) || units < 1) {
        setError(`Content ${index + 1}: needs a product and a unit count`);
        return;
      }
      parsed.push({ productId: row.productId, units });
    }
    if (parsed.length === 0) {
      setError("Add at least one product");
      return;
    }
    const data = {
      name: name.trim(),
      barcodes: barcodesText
        .split(/[\s,]+/)
        .map((code) => code.trim())
        .filter(Boolean),
      contents: parsed,
      active: true,
    };
    if (packId) {
      update.mutate({ id: packId, ...data });
    } else {
      create.mutate(data);
    }
  };

  const setContent = (index: number, patch: Partial<ContentRow>) =>
    setContents(
      contents.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  return (
    <Page max="xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-bold text-grey-800">
          {packId ? "Edit Pack" : "New Pack"}
        </h1>
        <Link to="/packs" className="text-sm text-grey-600 hover:text-grey-800">
          ← Back
        </Link>
      </div>

      <ErrorNote message={error} />

      <form onSubmit={submit} className="space-y-4">
        <input
          className={inputClass}
          placeholder="Name * (e.g. Kirkland Coke 35pk, Frito-Lay 30ct variety)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Case barcodes (comma-separated, optional)"
          value={barcodesText}
          onChange={(e) => setBarcodesText(e.target.value)}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-grey-700">
            Contents — what's inside one pack, in sellable units
          </legend>
          {contents.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_6rem_2rem] gap-2">
              <select
                className={inputClass}
                value={row.productId}
                onChange={(e) => setContent(index, { productId: e.target.value })}
              >
                <option value="">Product…</option>
                {products.data?.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                placeholder="Units"
                value={row.units}
                onChange={(e) => setContent(index, { units: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setContents(contents.filter((_, i) => i !== index))}
                className="text-grey-400 hover:text-red-600"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setContents([...contents, { ...EMPTY_CONTENT }])}
            className="text-sm text-primary-600 hover:text-primary-500"
          >
            + Add product (variety packs have several)
          </button>
        </fieldset>

        <button
          type="submit"
          disabled={create.isPending || update.isPending}
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
        >
          {packId ? "Save Changes" : "Create Pack"}
        </button>
      </form>
    </Page>
  );
}
