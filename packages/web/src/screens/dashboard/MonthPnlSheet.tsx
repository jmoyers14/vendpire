import type { UseQueryResult } from "@tanstack/react-query";
import type { ApiPnlSheet } from "../../apiTypes.ts";
import { Card, ErrorNote } from "../../ui.tsx";
import { formatCentsOrUnknown, formatSignedCents } from "../../utils/money.ts";
import { type Month, monthLabel } from "./month.ts";
import { buildSheetRows, type SheetRow, type TotalScope } from "./sheetRows.ts";

/** Positives unsigned: a column of "+" reads as noise in a spreadsheet. */
const formatProfit = (cents: number | null): string =>
  cents !== null && cents < 0 ? formatSignedCents(cents) : formatCentsOrUnknown(cents);

// Deliberately a spreadsheet, gridlines and all: it's read row by row, like the books.
const cell = "border border-line px-3 py-1.5";
const numberCell = `${cell} text-right font-mono tabular-nums`;

const ROW_STYLE: Record<SheetRow["kind"], string> = {
  location: "bg-line font-bold text-ink",
  machine: "bg-divider font-bold text-ink",
  item: "bg-card text-ink-soft",
  pulled: "bg-danger-soft text-danger",
  // Totals take their colour from SCOPE_STYLE, so the grand total's light text isn't overridden.
  total: "bg-app italic",
  net: "bg-app italic",
};

const SCOPE_STYLE: Record<TotalScope, string> = {
  machine: "text-ink",
  location: "bg-divider font-bold not-italic text-ink",
  grand: "bg-ink font-bold not-italic text-card",
};

const INDENT: Record<SheetRow["kind"], string> = {
  location: "",
  machine: "pl-6",
  item: "pl-10",
  pulled: "pl-10",
  total: "pl-6",
  net: "pl-6",
};

const figuresOf = (row: SheetRow) => {
  switch (row.kind) {
    case "item":
    case "total":
      return {
        units: row.units,
        sales: formatCentsOrUnknown(row.revenueCents),
        cogs: formatCentsOrUnknown(row.cogsCents),
        profit: formatProfit(row.grossProfitCents),
      };
    case "pulled":
      return {
        units: row.units,
        profit: formatProfit(row.costCents === null ? null : -row.costCents),
      };
    case "net":
      return { profit: formatProfit(row.netProfitCents) };
    default:
      return null;
  }
};

const SheetTableRow = ({ row }: { row: SheetRow }) => {
  const scopeStyle =
    row.kind === "total" || row.kind === "net" ? SCOPE_STYLE[row.scope] : "";
  const rowClass = `${ROW_STYLE[row.kind]} ${scopeStyle}`;
  const figures = figuresOf(row);
  const isLoss = row.kind === "item" && (row.grossProfitCents ?? 0) < 0;

  if (figures === null) {
    return (
      <tr className={rowClass}>
        <td colSpan={5} className={`${cell} ${INDENT[row.kind]}`}>
          {row.label}
        </td>
      </tr>
    );
  }
  return (
    <tr className={rowClass}>
      <td className={`${cell} ${INDENT[row.kind]}`}>
        {row.label}
        {row.kind === "pulled" ? " (pulled)" : null}
      </td>
      <td className={numberCell}>{figures.units}</td>
      <td className={numberCell}>{figures.sales}</td>
      <td className={numberCell}>{figures.cogs}</td>
      <td className={`${numberCell} ${isLoss ? "text-loss" : ""}`}>
        {figures.profit}
      </td>
    </tr>
  );
};

/** One month of sales and gross profit across every machine, spreadsheet-style. */
export function MonthPnlSheet({
  month,
  sheet,
}: {
  month: Month;
  /** Loaded by the page, which shows the month's totals from the same query. */
  sheet: UseQueryResult<ApiPnlSheet, { message: string }>;
}) {
  const rows = sheet.data ? buildSheetRows(sheet.data) : [];
  const totals = sheet.data?.totals;

  return (
    <Card className="grid gap-4 border border-line p-5">
      <h2 className="font-display text-heading text-ink">Sales &amp; gross profit</h2>

      {sheet.isLoading ? <p className="text-body text-muted-strong">Loading…</p> : null}
      <ErrorNote
        message={sheet.error ? `Couldn't load ${monthLabel(month)}: ${sheet.error.message}` : null}
      />
      {sheet.data && rows.length === 0 ? (
        <p className="text-body text-ink-soft">No sales counted in {monthLabel(month)}.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-body-sm">
            <thead>
              <tr className="bg-app text-left text-overline text-muted-strong uppercase">
                <th className={cell}>Item</th>
                <th className={`${cell} text-right`}>Units</th>
                <th className={`${cell} text-right`}>Gross sales</th>
                <th className={`${cell} text-right`}>COGS</th>
                <th className={`${cell} text-right`}>Gross profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SheetTableRow key={row.key} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {totals && totals.unknownCostRows > 0 ? (
        <p className="text-body-sm text-muted-strong">
          — means an item has no purchase recorded, so its cost is unknown.
        </p>
      ) : null}
      {totals && totals.unknownRemovalReasonRows > 0 ? (
        <p className="text-body-sm text-muted-strong">
          Some pulled items have no reason recorded, so the loss after them can&apos;t be totaled.
        </p>
      ) : null}
    </Card>
  );
}
