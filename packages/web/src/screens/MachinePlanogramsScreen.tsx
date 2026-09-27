import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass, Page, TableScroll } from "../components/ui.tsx";
import { formatCents, parseDollarsToCents } from "../lib/money.ts";

interface SlotRow {
  slotCode: string;
  productId: string;
  par: string;
  price: string;
}

/**
 * A machine's planogram: the current version, its history, and an editor that
 * saves a NEW immutable version (prefilled from the current one, so a weekly
 * tweak is edit-two-rows-and-save).
 */
export function MachinePlanogramsScreen({ machineId }: { machineId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<SlotRow[]>([]);

  const machine = useQuery(trpc.machines.get.queryOptions({ id: machineId }));
  const products = useQuery(trpc.products.list.queryOptions());
  const versions = useQuery(
    trpc.planograms.listByMachine.queryOptions({ machineId }),
  );
  const current = versions.data?.[0] ?? null;

  // Entering edit mode: prefill one row per machine slot from the current
  // version (empty product = slot left unassigned, filtered out on save).
  useEffect(() => {
    if (!editing || !machine.data) {
      return;
    }
    setRows(
      machine.data.slotCodes.map((slotCode) => {
        const slot = current?.slots.find((s) => s.slotCode === slotCode);
        return {
          slotCode,
          productId: slot?.productId ?? "",
          par: slot ? String(slot.par) : "",
          price: slot ? String(slot.priceCents / 100) : "",
        };
      }),
    );
  }, [editing, machine.data, current]);

  const create = useMutation(
    trpc.planograms.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.planograms.listByMachine.queryKey({ machineId }),
        });
        setEditing(false);
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

  const productName = (id: string): string =>
    products.data?.find((product) => product.id === id)?.name ?? id;

  const save = () => {
    setError(null);
    const slots = [];
    for (const row of rows) {
      if (!row.productId) {
        continue;
      }
      const par = Number.parseInt(row.par, 10);
      const priceCents = parseDollarsToCents(row.price);
      if (Number.isNaN(par) || par < 1) {
        setError(`Slot ${row.slotCode}: par must be a positive number`);
        return;
      }
      if (priceCents === null) {
        setError(`Slot ${row.slotCode}: price must be a dollar amount`);
        return;
      }
      slots.push({ slotCode: row.slotCode, productId: row.productId, par, priceCents });
    }
    if (slots.length === 0) {
      setError("Assign at least one slot");
      return;
    }
    create.mutate({ machineId, slots });
  };

  const setRow = (index: number, patch: Partial<SlotRow>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Page max="4xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-bold text-grey-800">
          Planogram — {machine.data?.name ?? "…"}
        </h1>
        <Link to="/machines" className="text-sm text-grey-600 hover:text-grey-800">
          ← Machines
        </Link>
      </div>

      <ErrorNote message={error} />

      {editing ? (
        <div className="space-y-3">
          <TableScroll>
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-grey-200 bg-grey-50 text-left text-grey-600">
                  <th className="px-3 py-2 font-medium">Slot</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="w-24 px-3 py-2 font-medium">Par</th>
                  <th className="w-28 px-3 py-2 font-medium">Price $</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.slotCode} className="border-b border-grey-100">
                    <td className="px-3 py-1.5 font-mono text-grey-800">
                      {row.slotCode}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        className={inputClass}
                        value={row.productId}
                        onChange={(e) => setRow(index, { productId: e.target.value })}
                      >
                        <option value="">— empty —</option>
                        {products.data?.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className={inputClass}
                        value={row.par}
                        onChange={(e) => setRow(index, { par: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        className={inputClass}
                        value={row.price}
                        onChange={(e) => setRow(index, { price: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={create.isPending}
              className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
            >
              Save New Version
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-grey-300 px-4 py-2 text-sm text-grey-700 hover:bg-grey-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-grey-600">
              {current
                ? `Current since ${new Date(current.effectiveFrom).toLocaleDateString()} · ${current.slots.length} slot(s) assigned`
                : "No planogram yet."}
            </p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
            >
              {current ? "New Version" : "Set Up Planogram"}
            </button>
          </div>

          {current ? (
            <TableScroll>
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-grey-200 bg-grey-50 text-left text-grey-600">
                    <th className="px-4 py-2 font-medium">Slot</th>
                    <th className="px-4 py-2 font-medium">Product</th>
                    <th className="px-4 py-2 font-medium">Par</th>
                    <th className="px-4 py-2 font-medium">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {current.slots.map((slot) => (
                    <tr key={slot.slotCode} className="border-b border-grey-100">
                      <td className="px-4 py-2 font-mono text-grey-800">
                        {slot.slotCode}
                      </td>
                      <td className="px-4 py-2 text-grey-800">
                        {productName(slot.productId)}
                      </td>
                      <td className="px-4 py-2 text-grey-600">{slot.par}</td>
                      <td className="px-4 py-2 text-grey-600">
                        {formatCents(slot.priceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          ) : null}

          {versions.data && versions.data.length > 1 ? (
            <div>
              <h2 className="mb-1 text-sm font-medium text-grey-700">History</h2>
              <ul className="space-y-1 text-sm text-grey-600">
                {versions.data.slice(1).map((version) => (
                  <li key={version.id}>
                    {new Date(version.effectiveFrom).toLocaleString()} —{" "}
                    {version.slots.length} slot(s)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}
