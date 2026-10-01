import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { buttonClass, EmptyState, ErrorNote, Page, PageTitle, TableScroll } from "../components/ui.tsx";
import { formatBps, formatCents } from "../lib/money.ts";
import { queryClient, trpc } from "../trpc.ts";

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
        <PageTitle>
          Locations
        </PageTitle>
        <Link
          to="/locations/new"
          className={buttonClass({ size: "sm" })}
        >
          Add Location
        </Link>
      </div>

      <ErrorNote message={error} />

      {locations.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : locations.data && locations.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
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
                <tr key={location.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {location.name}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {location.address.city ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {commissionLabel(location.commission)}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {location.contact.name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
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
          No locations yet. Click{" "}
          <span className="font-medium">Add Location</span> to add the first
          spot your machines live.
        </EmptyState>
      )}
    </Page>
  );
}
