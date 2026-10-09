import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { levelAfter } from "@vendpire/domain";
import type { ApiVisit, ApiVisitLine } from "../../apiTypes.ts";
import {
  Alert,
  Button,
  buttonClass,
  Card,
  CardTitle,
  EmptyState,
  ErrorNote,
  KpiCard,
  KpiGrid,
  Page,
  PageTitle,
  type SlotCell,
  SlotFaceGrid,
  TableScroll,
} from "../../ui.tsx";
import { queryClient, trpc } from "../../trpc.ts";
import { formatCents, formatSignedCents } from "../../utils/money.ts";
import {
  buildProductSales,
  buildUnknownNotes,
  buildVisitPnlGroups,
  describeAnomaly,
  isActionableAnomaly,
  type VisitPnlGroup,
} from "./pnlRows.ts";

/** A figure the engine reports as unknown is never a number and never a bare
 *  dash on its own — the notes below the KPIs say why. */
const UNKNOWN = "—";

const money = (cents: number | null): string =>
  cents === null ? UNKNOWN : formatCents(cents);

const signedMoney = (cents: number | null): string =>
  cents === null ? UNKNOWN : formatSignedCents(cents);

const whenOf = (iso: string): string => new Date(iso).toLocaleString();

/** Enough to see a pattern, few enough to read without scrolling. */
const TOP_SELLER_COUNT = 5;

/**
 * A machine's visit history and what it earned.
 *
 * Every figure here is DERIVED at read time from the visit sequence and the
 * org's purchase lines — nothing is stored. A receipt entered three weeks late
 * corrects a visit that predates it, with no backfill.
 */
export function MachineVisitsScreen({ machineId }: { machineId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const machine = useQuery(trpc.machines.get.queryOptions({ id: machineId }));
  const products = useQuery(trpc.products.list.queryOptions());
  const visits = useQuery(trpc.visits.list.queryOptions({ machineId }));
  const pnl = useQuery(trpc.visits.pnl.queryOptions({ machineId }));

  const remove = useMutation(
    trpc.visits.remove.mutationOptions({
      onSuccess: () => {
        // Both, and not just the list: removing a visit re-opens the interval
        // around it, so every derived figure downstream changes.
        queryClient.invalidateQueries({ queryKey: trpc.visits.list.pathKey() });
        queryClient.invalidateQueries({ queryKey: trpc.visits.pnl.pathKey() });
        setPendingDelete(null);
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

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
    return buildUnknownNotes({
      totals: pnl.data.totals,
      anomalies: pnl.data.anomalies,
    });
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

  return (
    <Page max="4xl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Visits — {machine.data?.name ?? "…"}</PageTitle>
        <div className="flex items-center gap-3">
          <Link
            to="/machines"
            className="text-sm text-gray-600 hover:text-gray-800"
          >
            ← Machines
          </Link>
          <Link
            to="/machines/$machineId/visits/new"
            params={{ machineId }}
            className={buttonClass({ size: "sm" })}
          >
            Log Visit
          </Link>
        </div>
      </div>

      <ErrorNote message={error} />

      {totals ? (
        <>
          <KpiGrid>
            <KpiCard label="Revenue" value={formatCents(totals.revenueCents)} />
            <KpiCard label="COGS" value={money(totals.cogsCents)} />
            <KpiCard
              label="Gross profit"
              value={signedMoney(totals.grossProfitCents)}
              tone={
                totals.grossProfitCents === null
                  ? "neutral"
                  : totals.grossProfitCents < 0
                    ? "loss"
                    : "profit"
              }
            />
            {/* "After write-offs", not "Net profit": there are no operating
                expenses in v1 — no fuel, labour or depreciation — so this is
                net of the goods you lost, not net of running the route.
                "Write-off" is the domain's word; "waste" was a synonym that
                sent a reader looking for a third concept. */}
            <KpiCard
              label="After write-offs"
              value={signedMoney(totals.netProfitCents)}
              tone={
                totals.netProfitCents === null
                  ? "neutral"
                  : totals.netProfitCents < 0
                    ? "loss"
                    : "profit"
              }
            />
          </KpiGrid>

          {totals.writeOffUnits > 0 ? (
            <p className="text-sm text-gray-600">
              Written off: {totals.writeOffUnits} unit(s) at{" "}
              <span className="text-loss">{money(totals.writeOffCents)}</span>
            </p>
          ) : null}

          {/* A fact about the period, not a problem — so plain text beside the
              write-off figure rather than an amber alert. Units with no cost
              is the correct reporting: those units are still yours, and their
              COGS lands wherever they eventually sell. */}
          {totals.returnedToStockUnits > 0 ? (
            <p className="text-sm text-gray-600">
              Back to stock: {totals.returnedToStockUnits} unit(s) destocked or
              transferred, carrying their cost with them.
            </p>
          ) : null}

          {/* Honest unknowns, in words. A null profit must never render as a
              number, and a dash the reader has to interpret is nearly as bad. */}
          {notes.map((note) => (
            <Alert key={note} tone="warning" title={note} />
          ))}

          {grouping && grouping.ungroupedIntervalCount > 0 ? (
            <Alert
              tone="warning"
              title={`${grouping.ungroupedIntervalCount} interval(s) belong to visits older than this list`}
            >
              Their revenue is in the totals above but has no row below.
            </Alert>
          ) : null}

          {topSellers.length > 0 ? (
            <Card className="flex flex-col gap-2 p-3">
              <CardTitle>Top sellers</CardTitle>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-1 font-medium">Product</th>
                    <th className="py-1 text-right font-medium">Sold</th>
                    <th className="py-1 text-right font-medium">Revenue</th>
                    <th className="py-1 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {topSellers.map((sales) => (
                    <tr
                      key={sales.productId}
                      className="border-t border-divider"
                    >
                      <td className="py-1.5 text-body">
                        {productName(sales.productId)}
                        {/* A product measured over fewer intervals than it
                            actually traded is not a product that sells badly
                            — say so rather than let it rank low in silence. */}
                        {sales.unknownIntervalCount > 0 ? (
                          <span
                            className="ml-1.5 text-xs text-muted"
                            title={`${sales.unknownIntervalCount} interval(s) for this product have no sold figure, so these totals are a floor rather than the whole picture.`}
                          >
                            (+{sales.unknownIntervalCount} uncounted)
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {sales.soldUnits}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatCents(sales.revenueCents)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-medium">
                        {signedMoney(sales.profitCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}

          {notableAnomalies.length > 0 ? (
            <Card className="flex flex-col gap-1.5 p-3">
              <CardTitle>Worth a look</CardTitle>
              <ul className="flex flex-col gap-1 text-sm text-body">
                {notableAnomalies.map((description) => (
                  <li key={description}>{description}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}

      {visits.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : visits.data && visits.data.length > 0 ? (
        <div className="flex flex-col gap-2">
          {visits.data.map((visit) => (
            <VisitCard
              key={visit.id}
              visit={visit}
              group={groupOf(visit.id)}
              shelves={machine.data?.slots ?? []}
              productName={productName}
              isExpanded={expanded === visit.id}
              onToggle={() =>
                setExpanded(expanded === visit.id ? null : visit.id)
              }
              isPendingDelete={pendingDelete === visit.id}
              onDelete={() =>
                pendingDelete === visit.id
                  ? remove.mutate({ id: visit.id })
                  : setPendingDelete(visit.id)
              }
              onCancelDelete={() => setPendingDelete(null)}
            />
          ))}
        </div>
      ) : (
        <EmptyState>
          No visits logged yet.{" "}
          <Link
            to="/machines/$machineId/visits/new"
            params={{ machineId }}
            className="font-medium text-primary-600 hover:text-primary-500"
          >
            Log the first one
          </Link>
          .
        </EmptyState>
      )}
    </Page>
  );
}

interface VisitCardProps {
  visit: ApiVisit;
  group: VisitPnlGroup | undefined;
  shelves: string[][];
  productName: (id: string) => string;
  isExpanded: boolean;
  onToggle: () => void;
  isPendingDelete: boolean;
  onDelete: () => void;
  onCancelDelete: () => void;
}

/**
 * One visit: what it earned over the interval it CLOSED, and — expanded — the
 * face as it was counted plus the per-slot arithmetic.
 */
function VisitCard({
  visit,
  group,
  shelves,
  productName,
  isExpanded,
  onToggle,
  isPendingDelete,
  onDelete,
  onCancelDelete,
}: VisitCardProps) {
  const lineOf = (slotCode: string): ApiVisitLine | undefined =>
    visit.lines.find((line) => line.slotCode === slotCode);

  const renderCell = (slotCode: string): SlotCell => {
    const line = lineOf(slotCode);
    if (!line) {
      return {
        state: "empty",
        // Not a zero. The engine reports this slot as not counted, and the
        // distinction is the difference between no data and a false sale.
        title: `${slotCode}: not counted on this visit`,
        content: (
          <>
            <div className="font-mono text-[10px] text-muted">{slotCode}</div>
            <div className="text-[10px] text-gray-400">not counted</div>
          </>
        ),
      };
    }
    return {
      state: line.removed > 0 ? "attention" : "done",
      title: `${slotCode}: ${productName(line.productId)} — left ${line.remaining}, added ${line.added}${
        line.removed > 0 ? `, removed ${line.removed} (${line.removedReason})` : ""
      }, walked away with ${levelAfter(line)}`,
      content: (
        <>
          <div className="font-mono text-[10px] text-muted">{slotCode}</div>
          <div className="truncate text-[11px] font-medium text-gray-800">
            {productName(line.productId)}
          </div>
          <div className="text-[10px] tabular-nums text-gray-600">
            {line.remaining} → {levelAfter(line)}
          </div>
        </>
      ),
    };
  };

  return (
    <Card className="flex flex-col gap-3 p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-wrap items-baseline justify-between gap-2 text-left"
      >
        <span className="flex flex-col">
          <span className="font-bold text-heading">
            {whenOf(visit.countedAt)}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {visit.lines.length} slot(s) counted
            {group && group.rows.intervals.length > 0
              ? ` · ${group.rows.intervals.length} interval(s) closed`
              : ""}
          </span>
        </span>
        <span className="flex items-baseline gap-3 tabular-nums">
          {group ? (
            <>
              <span className="text-sm text-body">
                {formatCents(group.totals.revenueCents)}
              </span>
              <span
                className={`font-display font-extrabold ${
                  group.totals.netProfitCents === null
                    ? "text-muted"
                    : group.totals.netProfitCents < 0
                      ? "text-loss"
                      : "text-profit"
                }`}
              >
                {signedMoney(group.totals.netProfitCents)}
              </span>
            </>
          ) : null}
          <span className="text-xs text-muted">{isExpanded ? "▲" : "▼"}</span>
        </span>
      </button>

      {isExpanded ? (
        <>
          {visit.notes ? (
            <p className="text-sm italic text-body">“{visit.notes}”</p>
          ) : null}

          <SlotFaceGrid shelves={shelves} renderCell={renderCell} />

          {group && group.rows.intervals.length > 0 ? (
            <TableScroll>
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-gray-50 text-left text-gray-600">
                    <th className="px-3 py-2 font-medium">Slot</th>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Sold</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">Revenue</th>
                    <th className="px-3 py-2 text-right font-medium">COGS</th>
                    <th className="px-3 py-2 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.intervals.map((row) => {
                    const { interval } = row;
                    const profit =
                      row.cogsCents === null
                        ? null
                        : row.revenueCents - row.cogsCents;
                    return (
                      <tr
                        key={`${interval.slotCode}-${interval.productId}`}
                        className="border-b border-divider"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-muted">
                          {interval.slotCode}
                        </td>
                        <td className="px-3 py-2 text-body">
                          {productName(interval.productId)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {interval.sold.status === "known" ? (
                            interval.sold.units
                          ) : (
                            <span
                              className="text-muted"
                              title={`No sold figure: ${interval.sold.reason}`}
                            >
                              {interval.sold.reason}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                          {formatCents(interval.priceCents)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCents(row.revenueCents)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                          {money(row.cogsCents)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {signedMoney(profit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          ) : (
            <p className="text-sm text-gray-600">
              No closed intervals — this is the machine's first visit, so there
              is no earlier count to compare against.
            </p>
          )}

          {group && group.rows.removals.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm text-body">
              {group.rows.removals.map((row) => (
                <li key={`${row.removal.slotCode}-${row.removal.productId}`}>
                  {row.removal.slotCode}: {row.removal.units} unit(s) out —{" "}
                  {row.removal.reason ?? "no reason recorded"}
                  {row.disposition === "written-off"
                    ? ` · written off at ${money(row.costCents)}`
                    : row.disposition === "returned-to-stock"
                      ? " · back to stock, cost follows the units"
                      : " · neither a loss nor a transfer until a reason is set"}
                </li>
              ))}
            </ul>
          ) : null}

          {/* No edit: a visit's `remaining` is the next visit's baseline, so
              editing one would rewrite the interval after it. Remove and
              re-count instead — which is exactly what the API allows. */}
          <div className="flex items-center gap-2">
            {isPendingDelete ? (
              <>
                <Button variant="danger" size="sm" onClick={onDelete}>
                  Really delete this visit
                </Button>
                <Button variant="secondary" size="sm" onClick={onCancelDelete}>
                  Cancel
                </Button>
              </>
            ) : (
              <button
                type="button"
                onClick={onDelete}
                className="text-sm text-gray-400 hover:text-red-600"
              >
                Delete visit
              </button>
            )}
            <span className="text-xs text-muted">
              Visits can't be edited — a count is the next interval's baseline.
              Delete and re-log instead.
            </span>
          </div>
        </>
      ) : null}
    </Card>
  );
}
