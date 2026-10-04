import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  buttonClass,
  EmptyState,
  ErrorNote,
  Page,
  PageTitle,
  TableScroll,
} from "../../ui.tsx";
import { queryClient, trpc } from "../../trpc.ts";

export function MachineTemplatesScreen() {
  const [error, setError] = useState<string | null>(null);
  const templates = useQuery(trpc.machineTemplates.list.queryOptions());

  const remove = useMutation(
    trpc.machineTemplates.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.machineTemplates.list.queryKey(),
        });
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

  return (
    <Page max="4xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>Machine Templates</PageTitle>
        <div className="flex items-center gap-3">
          <Link
            to="/machines"
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            ← Machines
          </Link>
          <Link
            to="/machines/templates/new"
            className={buttonClass({ size: "sm" })}
          >
            Add Template
          </Link>
        </div>
      </div>

      <p className="text-sm text-gray-600">
        A saved machine face you can reuse. Machines copy the layout when you
        create them, so editing a template never changes a machine already out
        on the route.
      </p>

      <ErrorNote message={error} />

      {templates.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : templates.data && templates.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Kind</th>
                <th className="px-4 py-2 font-medium">Make / Model</th>
                <th className="px-4 py-2 font-medium">Slots</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {templates.data.map((template) => (
                <tr key={template.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {template.name}
                  </td>
                  <td className="px-4 py-2 capitalize text-gray-600">
                    {template.kind}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {[template.make, template.model].filter(Boolean).join(" ") ||
                      "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {template.slots.flat().length}
                  </td>
                  <td className="space-x-3 px-4 py-2 text-right">
                    <Link
                      to="/machines/templates/$templateId/edit"
                      params={{ templateId: template.id }}
                      className="text-primary-600 hover:text-primary-500"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove.mutate({ id: template.id })}
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
          No templates yet. Build one here, or save a layout from the machine
          form as you go.
        </EmptyState>
      )}
    </Page>
  );
}
