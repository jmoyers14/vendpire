import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { buttonClass, EmptyState, ErrorNote, Page, PageTitle, TableScroll } from "../../ui.tsx";
import { queryClient, trpc } from "../../trpc.ts";

export function MachinesScreen() {
  const [error, setError] = useState<string | null>(null);
  const machines = useQuery(trpc.machines.list.queryOptions());
  const locations = useQuery(trpc.locations.list.queryOptions());

  const locationName = (id: string): string =>
    locations.data?.find((location) => location.id === id)?.name ?? "—";

  const remove = useMutation(
    trpc.machines.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.machines.list.queryKey(),
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
          Machines
        </PageTitle>
        <Link
          to="/machines/new"
          className={buttonClass({ size: "sm" })}
        >
          Add Machine
        </Link>
      </div>

      <ErrorNote message={error} />

      {machines.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : machines.data && machines.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Slots</th>
                <th className="px-4 py-2 font-medium">Tag</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {machines.data.map((machine) => (
                <tr key={machine.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {machine.name}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {locationName(machine.locationId)}
                  </td>
                  <td className="px-4 py-2 capitalize text-gray-600">
                    {machine.kind}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {machine.slots.flat().length}
                  </td>
                  <td className="px-4 py-2 font-mono text-gray-600">
                    {machine.tagCode ?? "—"}
                  </td>
                  <td className="space-x-3 px-4 py-2 text-right">
                    <Link
                      to="/machines/$machineId/planograms"
                      params={{ machineId: machine.id }}
                      className="text-primary-600 hover:text-primary-500"
                    >
                      Planogram
                    </Link>
                    <Link
                      to="/machines/$machineId/edit"
                      params={{ machineId: machine.id }}
                      className="text-primary-600 hover:text-primary-500"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove.mutate({ id: machine.id })}
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
          No machines yet. Add a location first, then{" "}
          <span className="font-medium">Add Machine</span>.
        </EmptyState>
      )}
    </Page>
  );
}
