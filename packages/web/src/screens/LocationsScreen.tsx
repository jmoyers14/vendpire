import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page, TableScroll } from "../components/ui.tsx";
import { formatBps, formatCents } from "../lib/money.ts";

const commissionLabel = (commission: {
  type: "none" | "percent" | "flat";
  percentBps: number | null;
  flatCents: number | null;
  basis: "gross" | "net" | null;
}): string => {
  if (commission.type === "percent" && commission.percentBps !== null) {
    return `${formatBps(commission.percentBps)} of ${commission.basis ?? "gross"}`;
  }
  if (commission.type === "flat" && commission.flatCents !== null) {
    return `${formatCents(commission.flatCents)} flat`;
  }
  return "None";
};

export function LocationsScreen() {
  const [error, setError] = useState<string | null>(null);
  const locations = useQuery(trpc.locations.list.queryOptions());

  const remove = useMutation(
    trpc.locations.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.locations.list.queryKey(),
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
          Locations
        </h1>
        <Link
          to="/locations/new"
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
        >
          Add Location
        </Link>
      </div>

      <ErrorNote message={error} />

      {locations.isLoading ? (
        <p className="text-grey-400">Loading…</p>
      ) : locations.data && locations.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-grey-200 bg-grey-50 text-left text-grey-600">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">City</th>
                <th className="px-4 py-2 font-medium">Commission</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Active</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {locations.data.map((location) => (
                <tr key={location.id} className="border-b border-grey-100">
                  <td className="px-4 py-2 font-medium text-grey-800">
                    {location.name}
                  </td>
                  <td className="px-4 py-2 text-grey-600">
                    {location.address.city ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-grey-600">
                    {commissionLabel(location.commission)}
                  </td>
                  <td className="px-4 py-2 text-grey-600">
                    {location.contact.name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-grey-600">
                    {location.active ? "Yes" : "No"}
                  </td>
                  <td className="space-x-3 px-4 py-2 text-right">
                    <Link
                      to="/locations/$locationId/edit"
                      params={{ locationId: location.id }}
                      className="text-primary-600 hover:text-primary-500"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove.mutate({ id: location.id })}
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
          No locations yet. Click{" "}
          <span className="font-medium">Add Location</span> to add the first
          spot your machines live.
        </div>
      )}
    </Page>
  );
}
