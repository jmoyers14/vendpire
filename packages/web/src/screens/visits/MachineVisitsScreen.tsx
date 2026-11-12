import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ApiVisit } from "../../apiTypes.ts";
import { queryClient, trpc } from "../../trpc.ts";
import {
  Alert,
  Button,
  buttonClass,
  Card,
  ErrorNote,
  eyebrowLinkClass,
  focusRing,
  KPI_TONE_TEXT,
  KpiCard,
  KpiGrid,
  kpiToneFor,
  MachineMap,
  Page,
  PageHeader,
  pageLinkClass,
  RowTable,
  RowTableBody,
  RowTableCellLabel,
  RowTableHeader,
  RowTableRow,
} from "../../ui.tsx";
import { formatShortDate, formatShortDateTime } from "../../utils/dates.ts";
import { formatCents, formatSignedCents } from "../../utils/money.ts";
import { plural } from "../../utils/text.ts";
import { MachineMetaLine, useLocationName } from "../machines/machineMeta.tsx";
import {
  buildProductSales,
  buildUnknownNotes,
  buildVisitPnlGroups,
  describeAnomaly,
  isActionableAnomaly,
  removalOutcomeFor,
  type VisitPnlGroup,
} from "./pnlRows.ts";
import { countedTileFor } from "./visitFace.ts";

/** A figure the engine reports as unknown is never a number and never a bare
 *  dash on its own — the notes below the KPIs say why. */
const UNKNOWN = "—";

const money = (cents: number | null): string => (cents === null ? UNKNOWN : formatCents(cents));

const signedMoney = (cents: number | null): string =>
  cents === null ? UNKNOWN : formatSignedCents(cents);

/** Enough to see a pattern, few enough to read without scrolling. */
const TOP_SELLER_COUNT = 5;

/** Product · Sold · Revenue · Profit. */
const SELLER_COLUMNS = "minmax(0,1fr) 48px 80px 80px";

/** When · Revenue · After write-offs · disclosure. */
const VISIT_COLUMNS = "minmax(0,1fr) 96px 136px 20px";

/** Slot · Product · Sold · Price · Revenue · COGS · Profit. */
const INTERVAL_COLUMNS = "48px minmax(0,1fr) 120px 72px 80px 80px 80px";

const numberCell = "text-right font-mono text-mono tabular-nums";

/**
 * A machine's visit history and what it earned.
 *
 * Every figure here is DERIVED at read time from the visit sequence and the
 * org's purchase lines — nothing is stored. A receipt entered three weeks late
 * corrects a visit that predates it, with no backfill.
 */
export function MachineVisitsScreen({ machineId }: { machineId: string }) {
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);

  const machine = useQuery(trpc.machines.get.queryOptions({ id: machineId }));
  const products = useQuery(trpc.products.list.queryOptions());
  const visits = useQuery(trpc.visits.list.queryOptions({ machineId }));
  const pnl = useQuery(trpc.pnl.byMachine.queryOptions({ machineId }));
  const locationName = useLocationName(machine.data);

  const grouping = useMemo(() => {
    if (!visits.data || !pnl.data) {
      return null;
    }
    return buildVisitPnlGroups({ visits: visits.data, rows: pnl.data.rows });
  }, [visits.data, pnl.data]);

  const notes = useMemo(() => {
    if (!pnl.data) {
      return [];
    }
    return buildUnknownNotes({ totals: pnl.data.totals, anomalies: pnl.data.anomalies });
  }, [pnl.data]);

  // Top few only: this is a glance at what earns its slot, not a report.
  const topSellers = useMemo(
    () =>
      (pnl.data ? buildProductSales(pnl.data.rows) : [])
        .filter((sales) => sales.soldUnits !== 0)
        .slice(0, TOP_SELLER_COUNT),
    [pnl.data],
  );

  // Described once, here, rather than in the key and again in the body.
  const notableAnomalies = useMemo(
    () =>
      (pnl.data?.anomalies ?? [])
        .filter(isActionableAnomaly)
        .map((anomaly) => describeAnomaly(anomaly)),
    [pnl.data],
  );

  const productName = (id: string): string =>
    products.data?.find((product) => product.id === id)?.name ?? id;

  const totals = pnl.data?.totals;
  const groupOf = (visitId: string): VisitPnlGroup | undefined =>
    grouping?.groups.find((group) => group.visitId === visitId);
  const latestVisit = visits.data?.[0];
  const loadError = machine.error ?? visits.error ?? pnl.error;

  return (
    <Page max="wide" className="grid gap-6">
      <PageHeader
        eyebrow={
          <>
            <Link to="/machines" className={eyebrowLinkClass}>
              Machines
            </Link>{" "}
            / Visit history
          </>
        }
        title={machine.data?.name ?? "…"}
        meta={
          <MachineMetaLine
            locationName={locationName}
            details={
              visits.data && latestVisit
                ? `${plural(visits.data.length, { one: "visit", many: "visits" })} · last ${formatShortDate(latestVisit.countedAt)}`
                : undefined
            }
          />
        }
        aside={
          <Link
            to="/machines/$machineId/visits/new"
            params={{ machineId }}
            className={buttonClass()}
          >
            Log visit
          </Link>
        }
      />

      <ErrorNote message={loadError ? `Couldn't load this history: ${loadError.message}` : null} />

      {totals ? (
        <section aria-label="Totals" className="grid gap-4">
          <KpiGrid>
            <KpiCard label="Revenue" value={formatCents(totals.revenueCents)} />
            <KpiCard label="COGS" value={money(totals.cogsCents)} />
            <KpiCard
              label="Gross profit"
              value={signedMoney(totals.grossProfitCents)}
              tone={kpiToneFor(totals.grossProfitCents)}
            />
            {/* "After write-offs", not "Net profit": there are no operating
                expenses in v1 — no fuel, labour or depreciation — so this is
                net of the goods you lost, not net of running the route.
                "Write-off" is the domain's word; "waste" was a synonym that
                sent a reader looking for a third concept. */}
            <KpiCard
              label="After write-offs"
              value={signedMoney(totals.netProfitCents)}
              tone={kpiToneFor(totals.netProfitCents)}
            />
          </KpiGrid>

          {totals.writeOffUnits > 0 || totals.returnedToStockUnits > 0 ? (
            <div className="grid gap-1 text-body-sm text-ink-soft">
              {totals.writeOffUnits > 0 ? (
                <p>
                  Written off: {plural(totals.writeOffUnits, { one: "unit", many: "units" })} at{" "}
                  <span className="font-mono text-loss tabular-nums">
                    {money(totals.writeOffCents)}
                  </span>
                </p>
              ) : null}
              {/* A fact about the period, not a problem — so plain text beside
                  the write-off figure rather than an amber alert. Units with no
                  cost is the correct reporting: those units are still yours,
                  and their COGS lands wherever they eventually sell. */}
              {totals.returnedToStockUnits > 0 ? (
                <p>
                  Back to stock:{" "}
                  {plural(totals.returnedToStockUnits, { one: "unit", many: "units" })} destocked or
                  transferred, carrying their cost with them.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Honest unknowns, in words. A null profit must never render as a
              number, and a dash the reader has to interpret is nearly as bad. */}
          {notes.map((note) => (
            <Alert key={note} tone="warning" title={note} />
          ))}

          {grouping && grouping.ungroupedIntervalCount > 0 ? (
            <Alert
              tone="warning"
              title={`${plural(grouping.ungroupedIntervalCount, { one: "interval belongs", many: "intervals belong" })} to visits older than this list`}
            >
              Their revenue is in the totals above but has no row below.
            </Alert>
          ) : null}
        </section>
      ) : null}

      {topSellers.length > 0 || notableAnomalies.length > 0 ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {topSellers.length > 0 ? (
            <Card className="grid gap-3 border border-line p-5">
              <h2 className="font-display text-heading text-ink">Top sellers</h2>
              <RowTable columns={SELLER_COLUMNS} variant="plain">
                <RowTableHeader>
                  <span>Product</span>
                  <span className="text-right">Sold</span>
                  <span className="text-right">Revenue</span>
                  <span className="text-right">Profit</span>
                </RowTableHeader>
                <RowTableBody>
                  {topSellers.map((sales) => (
                    <RowTableRow key={sales.productId}>
                      <span className="min-w-0 text-body-sm text-ink">
                        {productName(sales.productId)}
                        {/* A product measured over fewer intervals than it
                            actually traded is not a product that sells badly
                            — say so rather than let it rank low in silence. */}
                        {sales.unknownIntervalCount > 0 ? (
                          <span
                            className="block text-body-sm text-muted-strong"
                            title="Intervals with no sold figure, so these totals are a floor rather than the whole picture."
                          >
                            +{sales.unknownIntervalCount} uncounted
                          </span>
                        ) : null}
                      </span>
                      <span className={`${numberCell} text-ink`}>
                        <RowTableCellLabel>Sold</RowTableCellLabel>
                        {sales.soldUnits}
                      </span>
                      <span className={`${numberCell} text-ink`}>
                        <RowTableCellLabel>Revenue</RowTableCellLabel>
                        {formatCents(sales.revenueCents)}
                      </span>
                      <span
                        className={`${numberCell} font-bold ${KPI_TONE_TEXT[kpiToneFor(sales.profitCents)]}`}
                      >
                        <RowTableCellLabel>Profit</RowTableCellLabel>
                        {signedMoney(sales.profitCents)}
                      </span>
                    </RowTableRow>
                  ))}
                </RowTableBody>
              </RowTable>
            </Card>
          ) : null}

          {notableAnomalies.length > 0 ? (
            <Card className="grid gap-3 border border-line p-5">
              <h2 className="font-display text-heading text-ink">Worth a look</h2>
              <ul className="grid list-disc gap-2 pl-5 text-body-sm text-ink-soft">
                {notableAnomalies.map((description) => (
                  <li key={description}>{description}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Card className="grid gap-3 border border-line p-5">
        <h2 className="font-display text-heading text-ink">Visits</h2>
        {visits.isLoading ? <p className="text-body text-muted-strong">Loading…</p> : null}
        {visits.data && visits.data.length === 0 ? (
          <p className="py-4 text-body text-ink-soft">
            No visits logged yet.{" "}
            <Link
              to="/machines/$machineId/visits/new"
              params={{ machineId }}
              className={pageLinkClass}
            >
              Log the first one
            </Link>
          </p>
        ) : null}
        {visits.data && visits.data.length > 0 ? (
          <RowTable columns={VISIT_COLUMNS} variant="plain">
            <RowTableHeader className="max-sm:hidden">
              <span>Counted</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">After write-offs</span>
              <span />
            </RowTableHeader>
            <RowTableBody>
              {visits.data.map((visit) => (
                <VisitRow
                  key={visit.id}
                  visit={visit}
                  group={groupOf(visit.id)}
                  shelves={machine.data?.slots ?? []}
                  productName={productName}
                  isExpanded={expandedVisitId === visit.id}
                  onToggle={() => setExpandedVisitId(expandedVisitId === visit.id ? null : visit.id)}
                />
              ))}
            </RowTableBody>
          </RowTable>
        ) : null}
      </Card>
    </Page>
  );
}

interface VisitRowProps {
  visit: ApiVisit;
  group: VisitPnlGroup | undefined;
  shelves: string[][];
  productName: (id: string) => string;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * One visit: what it earned over the interval it CLOSED, and — expanded — the
 * face as it was counted plus the per-slot arithmetic.
 */
function VisitRow({ visit, group, shelves, productName, isExpanded, onToggle }: VisitRowProps) {
  const countedAt = formatShortDateTime(visit.countedAt);
  const countedSlotCount = new Set(visit.lines.map((line) => line.slotCode)).size;
  const intervalCount = group?.rows.intervals.length ?? 0;
  const detailsId = `visit-${visit.id}`;
  const summary = [
    `${plural(countedSlotCount, { one: "slot", many: "slots" })} counted`,
    intervalCount > 0 ? plural(intervalCount, { one: "sale figure", many: "sale figures" }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        className={`grid w-full grid-cols-(--row-columns) items-center gap-3 rounded-control py-3.5 text-left hover:bg-app max-sm:grid-cols-[minmax(0,1fr)_auto_20px] ${focusRing}`}
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="text-label text-ink">{countedAt}</span>
          <span className="text-body-sm text-muted-strong tabular-nums">{summary}</span>
        </span>
        <span className={`${numberCell} text-ink max-sm:hidden`}>
          <RowTableCellLabel>Revenue</RowTableCellLabel>
          {group ? formatCents(group.totals.revenueCents) : UNKNOWN}
        </span>
        <span
          className={`${numberCell} font-bold ${KPI_TONE_TEXT[kpiToneFor(group?.totals.netProfitCents ?? null)]}`}
        >
          <RowTableCellLabel>After write-offs</RowTableCellLabel>
          {signedMoney(group?.totals.netProfitCents ?? null)}
        </span>
        <span aria-hidden className="text-center text-muted-strong">
          {isExpanded ? "▴" : "▾"}
        </span>
      </button>

      {isExpanded ? (
        <div id={detailsId} className="grid gap-5 pt-2 pb-6">
          {visit.notes ? (
            <p className="text-body text-ink-soft italic">“{visit.notes}”</p>
          ) : null}

          <MachineMap
            shelves={shelves}
            tileFor={(slotCode) =>
              countedTileFor({
                slotCode,
                lines: visit.lines.filter((line) => line.slotCode === slotCode),
                productName,
              })
            }
          />

          {group && intervalCount > 0 ? (
            <IntervalTable group={group} productName={productName} />
          ) : (
            <p className="text-body-sm text-ink-soft">
              No sale figures. This is the machine's first visit, so there's no earlier count to
              compare against.
            </p>
          )}

          {group && group.rows.removals.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-label text-ink">Pulled from the machine</h3>
              <ul className="grid gap-1 text-body-sm text-ink-soft">
                {group.rows.removals.map((row) => (
                  <li key={`${row.removal.slotCode}-${row.removal.productId}`}>
                    <span className="font-mono">{row.removal.slotCode}</span>:{" "}
                    {plural(row.removal.units, { one: "unit", many: "units" })} out,{" "}
                    {row.removal.reason ?? "no reason recorded"}
                    {` · ${removalOutcomeFor(row)}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <DeleteVisit visitId={visit.id} countedAt={countedAt} />
        </div>
      ) : null}
    </div>
  );
}

/** What each slot sold over the interval this visit closed. */
function IntervalTable({
  group,
  productName,
}: {
  group: VisitPnlGroup;
  productName: (id: string) => string;
}) {
  return (
    <RowTable columns={INTERVAL_COLUMNS} minWidth="700px">
      <RowTableHeader>
        <span>Slot</span>
        <span>Product</span>
        <span className="text-right">Sold</span>
        <span className="text-right">Price</span>
        <span className="text-right">Revenue</span>
        <span className="text-right">COGS</span>
        <span className="text-right">Profit</span>
      </RowTableHeader>
      <RowTableBody>
        {group.rows.intervals.map((row) => {
          const { interval } = row;
          const profit = row.cogsCents === null ? null : row.revenueCents - row.cogsCents;
          return (
            <RowTableRow key={`${interval.slotCode}-${interval.productId}`}>
              <span className="font-mono text-body-sm text-muted-strong">
                <RowTableCellLabel>Slot</RowTableCellLabel>
                {interval.slotCode}
              </span>
              <span className="min-w-0 truncate text-body-sm text-ink">
                {productName(interval.productId)}
              </span>
              <span className={`${numberCell} text-ink`}>
                <RowTableCellLabel>Sold</RowTableCellLabel>
                {interval.sold.status === "known" ? (
                  interval.sold.units
                ) : (
                  <span
                    className="font-sans text-body-sm text-muted-strong"
                    title={`No sold figure: ${interval.sold.reason}`}
                  >
                    {interval.sold.reason}
                  </span>
                )}
              </span>
              <span className={`${numberCell} text-ink-soft`}>
                <RowTableCellLabel>Price</RowTableCellLabel>
                {formatCents(interval.priceCents)}
              </span>
              <span className={`${numberCell} text-ink`}>
                <RowTableCellLabel>Revenue</RowTableCellLabel>
                {formatCents(row.revenueCents)}
              </span>
              <span className={`${numberCell} text-ink-soft`}>
                <RowTableCellLabel>COGS</RowTableCellLabel>
                {money(row.cogsCents)}
              </span>
              <span className={`${numberCell} font-bold ${KPI_TONE_TEXT[kpiToneFor(profit)]}`}>
                <RowTableCellLabel>Profit</RowTableCellLabel>
                {signedMoney(profit)}
              </span>
            </RowTableRow>
          );
        })}
      </RowTableBody>
    </RowTable>
  );
}

/**
 * No edit: a visit's `remaining` is the next visit's baseline, so editing one
 * would rewrite the interval after it. Remove and re-count instead — which is
 * exactly what the API allows.
 */
function DeleteVisit({ visitId, countedAt }: { visitId: string; countedAt: string }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const remove = useMutation(
    trpc.visits.remove.mutationOptions({
      onSuccess: () => {
        // Both, and not just the list: removing a visit re-opens the interval
        // around it, so every derived figure downstream changes.
        queryClient.invalidateQueries({ queryKey: trpc.visits.list.pathKey() });
        queryClient.invalidateQueries({ queryKey: trpc.pnl.pathKey() });
      },
    }),
  );

  if (isConfirming) {
    return (
      <div className="grid gap-3 rounded-panel border border-line bg-app p-4">
        <p className="text-body text-ink">
          Delete the visit from <strong>{countedAt}</strong>? The sale figures around it are
          worked out again from the visits either side. This can't be undone.
        </p>
        <ErrorNote message={remove.error?.message ?? null} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            onClick={() => remove.mutate({ id: visitId })}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Deleting…" : "Delete visit"}
          </Button>
          <Button
            variant="secondary"
            autoFocus
            onClick={() => {
              setIsConfirming(false);
              remove.reset();
            }}
          >
            Keep it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-divider pt-4">
      <Button variant="text" size="sm" onClick={() => setIsConfirming(true)}>
        Delete visit
      </Button>
      <span className="text-body-sm text-muted-strong">
        Visits can't be edited, since each count is the starting point for the next. Delete it
        and log it again instead.
      </span>
    </div>
  );
}
