import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page, TableScroll } from "../components/ui.tsx";

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
        <h1 className="font-heading text-xl font-bold text-grey-800">
          Machines
        </h1>
        <Link
          to="/machines/new"
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
        >
          Add Machine
        </Link>
      </div>

      <ErrorNote message={error} />

      {machines.isLoading ? (
        <p className="text-grey-400">Loading…</p>
      ) : machines.data && machines.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-grey-200 bg-grey-50 text-left text-grey-600">
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
                <tr key={machine.id} className="border-b border-grey-100">
                  <td className="px-4 py-2 font-medium text-grey-800">
                    {machine.name}
                  </td>
                  <td className="px-4 py-2 text-grey-600">
                    {locationName(machine.locationId)}
                  </td>
                  <td className="px-4 py-2 capitalize text-grey-600">
                    {machine.kind}
                  </td>
                  <td className="px-4 py-2 text-grey-600">
                    {machine.slotCodes.length}
                  </td>
                  <td className="px-4 py-2 font-mono text-grey-600">
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
          No machines yet. Add a location first, then{" "}
          <span className="font-medium">Add Machine</span>.
        </div>
      )}
    </Page>
  );
}
