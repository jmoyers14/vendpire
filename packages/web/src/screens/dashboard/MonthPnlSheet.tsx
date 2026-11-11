import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, CardTitle } from "../../ui.tsx";
import { trpc } from "../../trpc.ts";
import { formatCents, formatSignedCents } from "../../utils/money.ts";
import {
  isSameMonth,
  monthAfter,
  monthLabel,
  monthOf,
  monthRange,
  type Month,
} from "./month.ts";
import { buildSheetRows, type SheetRow, type TotalScope } from "./sheetRows.ts";

const UNKNOWN = "—";

const formatMoney = (cents: number | null): string =>
  cents === null ? UNKNOWN : formatCents(cents);

/** Positives unsigned: a column of "+" reads as noise in a spreadsheet. */
const formatProfit = (cents: number | null): string =>
  cents !== null && cents < 0 ? formatSignedCents(cents) : formatMoney(cents);

const cell = "border border-line px-3 py-1";
const numberCell = `${cell} text-right font-mono tabular-nums`;

const ROW_STYLE: Record<SheetRow["kind"], string> = {
  location: "bg-gray-200 font-semibold text-ink",
  machine: "bg-gray-100 font-medium text-ink",
  item: "bg-card text-ink-soft",
  pulled: "bg-red-50 text-red-700",
  total: "bg-gray-50 italic text-ink",
  net: "bg-gray-50 italic text-ink",
};

const SCOPE_STYLE: Record<TotalScope, string> = {
  machine: "",
  location: "bg-gray-100 font-semibold not-italic",
  grand: "bg-gray-800 font-bold not-italic text-white",
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
        sales: formatMoney(row.revenueCents),
        cogs: formatMoney(row.cogsCents),
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
export function MonthPnlSheet() {
  const thisMonth = monthOf(new Date());
  const [month, setMonth] = useState<Month>(thisMonth);
  const sheet = useQuery(trpc.pnl.sheet.queryOptions(monthRange(month)));

  const rows = sheet.data ? buildSheetRows(sheet.data) : [];
  const totals = sheet.data?.totals;

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Sales &amp; gross profit</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous month"
            onClick={() => setMonth(monthAfter(month, -1))}
          >
            ◀
          </Button>
          <span className="min-w-32 text-center text-sm font-medium text-ink">
            {monthLabel(month)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next month"
            disabled={isSameMonth(month, thisMonth)}
            onClick={() => setMonth(monthAfter(month, 1))}
          >
            ▶
          </Button>
        </div>
      </div>

      {sheet.isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : sheet.isError ? (
        <p className="text-sm text-red-600">
          Couldn&apos;t load the month: {sheet.error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600">
          No sales counted in {monthLabel(month)}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className={`${cell} font-medium`}>Item</th>
                <th className={`${cell} text-right font-medium`}>Units</th>
                <th className={`${cell} text-right font-medium`}>Gross Sales</th>
                <th className={`${cell} text-right font-medium`}>COGS</th>
                <th className={`${cell} text-right font-medium`}>Gross Profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SheetTableRow key={row.key} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totals && totals.unknownCostRows > 0 ? (
        <p className="text-xs text-gray-500">
          — means an item has no purchase recorded, so its cost is unknown.
        </p>
      ) : null}
      {totals && totals.unknownRemovalReasonRows > 0 ? (
        <p className="text-xs text-gray-500">
          Some pulled items have no reason recorded, so the loss after them
          can&apos;t be totaled.
        </p>
      ) : null}
    </Card>
  );
}
