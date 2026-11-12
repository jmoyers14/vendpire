import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../trpc.ts";
import {
  Card,
  ErrorNote,
  RowTable,
  RowTableBody,
  RowTableCellLabel,
  RowTableHeader,
  RowTableRow,
} from "../../ui.tsx";
import { plural } from "../../utils/text.ts";
import { bestByFor } from "./expiry.ts";

/** Product · Units · Best by. */
const EXPIRY_COLUMNS = "minmax(0,1fr) 56px 168px";

/**
 * What to load before the next trip. Reads the latest visit per machine, so it
 * is only ever as current as the last time each machine was counted — which is
 * the right answer: stock only gets older between visits.
 */
export function ExpiringSoonCard() {
  const report = useQuery(trpc.visits.expiringSoon.queryOptions({}));
  const data = report.data;
  // The server lists undated slots under missingDates, so these all have a date;
  // this only narrows the type.
  const actionable = (data ? [...data.expired, ...data.expiringSoon] : []).flatMap((slot) =>
    slot.bestBy === null || slot.daysUntil === null
      ? []
      : [{ ...slot, expiry: bestByFor({ bestBy: slot.bestBy, daysUntil: slot.daysUntil }) }],
  );

  return (
    <Card className="grid gap-4 border border-line p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-heading text-ink">Expiring soon</h2>
        {data ? (
          <span className="text-body-sm text-muted-strong">Next {data.withinDays} days</span>
        ) : null}
      </div>

      {report.isLoading ? (
        <p className="text-body text-muted-strong">Checking what's expiring…</p>
      ) : null}
      <ErrorNote
        message={report.error ? `Couldn't load the expiry report: ${report.error.message}` : null}
      />

      {data && actionable.length === 0 ? (
        <p className="text-body text-ink-soft">Nothing expiring in the next {data.withinDays} days.</p>
      ) : null}
      {actionable.length > 0 ? (
        <RowTable columns={EXPIRY_COLUMNS} variant="plain">
          <RowTableHeader className="max-sm:hidden">
            <span>Product</span>
            <span className="text-right">Units</span>
            <span className="text-right">Best by</span>
          </RowTableHeader>
          <RowTableBody>
            {actionable.map((slot) => (
                <RowTableRow
                  key={`${slot.machineId} ${slot.slotCode} ${slot.productId}`}
                  className="max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-1"
                >
                  <span className="grid min-w-0 gap-0.5 max-sm:col-span-2">
                    <span className="truncate text-label text-ink">{slot.productName}</span>
                    <span className="truncate text-body-sm text-muted-strong">
                      <span className="font-mono">{slot.slotCode}</span> · {slot.locationName} /{" "}
                      {slot.machineName}
                    </span>
                  </span>
                  <span className="text-right font-mono text-mono text-ink tabular-nums max-sm:text-left">
                    <RowTableCellLabel className="max-sm:not-sr-only max-sm:font-sans max-sm:text-body-sm max-sm:text-muted-strong">
                      Units
                    </RowTableCellLabel>
                    {slot.units}
                  </span>
                  <span
                    className={`text-right text-body-sm font-bold ${slot.expiry.isExpired ? "text-danger" : "text-warning"}`}
                  >
                    <RowTableCellLabel>Best by</RowTableCellLabel>
                    {slot.expiry.label}
                  </span>
                </RowTableRow>
            ))}
          </RowTableBody>
        </RowTable>
      ) : null}

      {/* Shown even when both lists above are empty — that combination is
          precisely the one that would otherwise read as "all clear". */}
      {data && data.missingDates.length > 0 ? (
        <p className="border-t border-divider pt-3 text-body-sm text-muted-strong">
          No date on file for{" "}
          {plural(data.missingDates.length, { one: "stocked slot", many: "stocked slots" })}, so
          they aren't counted above.
        </p>
      ) : null}
    </Card>
  );
}
