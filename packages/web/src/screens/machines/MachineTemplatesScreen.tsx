import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ApiMachineTemplate } from "../../apiTypes.ts";
import { trpc } from "../../trpc.ts";
import {
  buttonClass,
  ErrorNote,
  eyebrowLinkClass,
  focusRing,
  Page,
  PageHeader,
  RowTable,
  RowTableBody,
  RowTableCellLabel,
  RowTableEmpty,
  RowTableHeader,
  RowTableRow,
} from "../../ui.tsx";
import { MACHINE_KIND_LABELS } from "./machineKind.ts";
import { makeModelFor } from "./templateForm.ts";

/** Template · Type · Slots. */
const TEMPLATE_COLUMNS = "minmax(0,1fr) 96px 72px";

/** Saved machine layouts to start a new machine from. */
export function MachineTemplatesScreen() {
  const templatesQuery = useQuery(trpc.machineTemplates.list.queryOptions());
  const templates = templatesQuery.data ?? [];

  return (
    <Page max="wide" className="grid gap-6">
      <PageHeader
        eyebrow={
          <Link to="/machines" className={eyebrowLinkClass}>
            Machines
          </Link>
        }
        title="Templates"
        meta="A machine layout you can reuse. Machines copy it when you create them, so editing a template never changes a machine already on your route."
        aside={
          <Link to="/machines/templates/new" className={buttonClass()}>
            Add template
          </Link>
        }
      />

      <ErrorNote message={templatesQuery.error?.message ?? null} />

      {templatesQuery.isLoading ? (
        <p className="text-body text-muted-strong">Loading…</p>
      ) : null}
      {templatesQuery.isSuccess ? (
        <RowTable columns={TEMPLATE_COLUMNS} className="rounded-panel bg-card shadow-card">
          <RowTableHeader>
            <span>Template</span>
            <span>Type</span>
            <span className="text-right">Slots</span>
          </RowTableHeader>
          {templates.length > 0 ? (
            <RowTableBody>
              {templates.map((template) => (
                <TemplateRow key={template.id} template={template} />
              ))}
            </RowTableBody>
          ) : (
            <RowTableEmpty>
              No templates yet. Add one here, or save a layout from a machine's edit page.
            </RowTableEmpty>
          )}
        </RowTable>
      ) : null}
    </Page>
  );
}

/** One template. The name links to its edit page. */
function TemplateRow({ template }: { template: ApiMachineTemplate }) {
  const makeModel = makeModelFor(template);
  return (
    <RowTableRow>
      <div className="grid min-w-0 gap-0.5">
        <Link
          to="/machines/templates/$templateId/edit"
          params={{ templateId: template.id }}
          className={`justify-self-start rounded-sm text-label text-ink hover:text-link hover:underline ${focusRing}`}
        >
          {template.name}
        </Link>
        {makeModel ? <p className="text-body-sm text-muted-strong">{makeModel}</p> : null}
      </div>
      <p className="text-body-sm text-ink">
        <RowTableCellLabel>Type</RowTableCellLabel>
        {MACHINE_KIND_LABELS[template.kind]}
      </p>
      <p className="text-right font-mono text-mono text-ink tabular-nums">
        <RowTableCellLabel>Slots</RowTableCellLabel>
        {template.slots.flat().length}
      </p>
    </RowTableRow>
  );
}
