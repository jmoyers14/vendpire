import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ApiMachine } from "../../apiTypes.ts";
import { trpc } from "../../trpc.ts";
import {
  Badge,
  buttonClass,
  ErrorNote,
  focusRing,
  Page,
  PageHeader,
  pageLinkClass,
  RowTable,
  RowTableBody,
  RowTableCellLabel,
  RowTableEmpty,
  RowTableHeader,
  RowTableRow,
} from "../../ui.tsx";
import { formatShortDate } from "../../utils/dates.ts";
import { machineSummaryFor } from "./machineForm.ts";

/** Machine · Last visit · Actions. */
const MACHINE_COLUMNS = "minmax(0,1fr) 120px 260px";

const rowLinkClass = `rounded-sm px-1.5 py-2 text-label text-link hover:underline ${focusRing}`;

/** The route's launch pad: start a visit or check a planogram. */
export function MachinesScreen() {
  const machinesQuery = useQuery(trpc.machines.list.queryOptions());
  const locationsQuery = useQuery(trpc.locations.list.queryOptions());
  const latestVisitsQuery = useQuery(trpc.visits.listLatestByOrg.queryOptions());

  const machines = machinesQuery.data ?? [];
  const locationNameById = new Map(
    (locationsQuery.data ?? []).map((location) => [location.id, location.name]),
  );
  const lastVisitAtByMachine = new Map(
    (latestVisitsQuery.data ?? []).map((visit) => [visit.machineId, visit.countedAt]),
  );
  const hasNoLocations = locationsQuery.isSuccess && locationsQuery.data.length === 0;

  return (
    <Page max="wide" className="grid gap-6">
      <PageHeader
        title="Machines"
        meta={machinesQuery.isLoading ? undefined : "Start a visit or check what's in each machine."}
        aside={
          <div className="flex flex-col-reverse items-end sm:flex-row sm:items-center sm:gap-4">
            <Link to="/machines/templates" className={pageLinkClass}>
              Templates
            </Link>
            <Link to="/machines/new" className={buttonClass()}>
              Add machine
            </Link>
          </div>
        }
      />

      <ErrorNote message={machinesQuery.error?.message ?? null} />
      <ErrorNote
        message={
          locationsQuery.error
            ? `Couldn't load location names: ${locationsQuery.error.message}`
            : null
        }
      />
      <ErrorNote
        message={
          latestVisitsQuery.error
            ? `Couldn't load last visits: ${latestVisitsQuery.error.message}`
            : null
        }
      />

      {machinesQuery.isLoading ? (
        <p className="text-body text-muted-strong">Loading…</p>
      ) : null}
      {machinesQuery.isSuccess ? (
        // No minWidth: on a phone the rows stack instead of scrolling sideways.
        <RowTable columns={MACHINE_COLUMNS} className="rounded-panel bg-card shadow-card">
          <RowTableHeader className="max-sm:hidden">
            <span>Machine</span>
            <span>Last visit</span>
            <span className="sr-only">Actions</span>
          </RowTableHeader>
          {machines.length > 0 ? (
            <RowTableBody>
              {machines.map((machine) => (
                <MachineRow
                  key={machine.id}
                  machine={machine}
                  locationName={locationNameById.get(machine.locationId) ?? null}
                  lastVisitAt={lastVisitAtByMachine.get(machine.id) ?? null}
                  isLastVisitLoading={latestVisitsQuery.isLoading}
                />
              ))}
            </RowTableBody>
          ) : (
            <RowTableEmpty>
              {hasNoLocations ? (
                <>
                  No machines yet. Machines live at a location, so{" "}
                  <Link to="/locations/new" className={`text-link hover:underline ${focusRing}`}>
                    add a location
                  </Link>{" "}
                  first.
                </>
              ) : (
                "No machines yet. Add the first one on your route."
              )}
            </RowTableEmpty>
          )}
        </RowTable>
      ) : null}
    </Page>
  );
}

/** One machine. The name links to its edit page; Log visit is the main action. */
function MachineRow({
  machine,
  locationName,
  lastVisitAt,
  isLastVisitLoading,
}: {
  machine: ApiMachine;
  locationName: string | null;
  lastVisitAt: string | null;
  isLastVisitLoading: boolean;
}) {
  const machineParams = { machineId: machine.id };
  return (
    <RowTableRow className="max-sm:grid-cols-1 max-sm:gap-2">
      <div className="grid min-w-0 gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/machines/$machineId/edit"
            params={machineParams}
            className={`rounded-sm text-label text-ink hover:text-link hover:underline ${focusRing}`}
          >
            {machine.name}
          </Link>
          {machine.active ? null : (
            <Badge size="sm" tone="neutral">
              Inactive
            </Badge>
          )}
        </div>
        <p className="text-body-sm text-muted-strong">
          {machineSummaryFor({ machine, locationName })}
        </p>
      </div>
      <LastVisitCell lastVisitAt={lastVisitAt} isLoading={isLastVisitLoading} />
      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        <Link
          to="/machines/$machineId/visits/new"
          params={machineParams}
          className={buttonClass({ variant: "secondary", size: "sm", className: "max-sm:mb-1 max-sm:basis-full" })}
        >
          Log visit
        </Link>
        <Link to="/machines/$machineId/planograms" params={machineParams} className={rowLinkClass}>
          Planogram
        </Link>
        <Link to="/machines/$machineId/visits" params={machineParams} className={rowLinkClass}>
          History
        </Link>
      </div>
    </RowTableRow>
  );
}

/** When the machine was last counted. */
function LastVisitCell({
  lastVisitAt,
  isLoading,
}: {
  lastVisitAt: string | null;
  isLoading: boolean;
}) {
  const label = (
    // The header is hidden on a phone, so there the cell names itself.
    <RowTableCellLabel className="max-sm:not-sr-only text-muted-strong">Last visit</RowTableCellLabel>
  );
  if (isLoading) {
    return <p className="text-body-sm text-muted-strong">{label}…</p>;
  }
  if (!lastVisitAt) {
    return <p className="text-body-sm text-muted-strong">{label}Never</p>;
  }
  return (
    <p className="text-body-sm text-ink tabular-nums">
      {label}
      {formatShortDate(lastVisitAt)}
    </p>
  );
}
