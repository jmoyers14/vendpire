import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { trpc } from "../../trpc.ts";
import { IconButton, Page, PageHeader } from "../../ui.tsx";
import { ProfitKpiGrid } from "../visits/ProfitKpiGrid.tsx";
import { ExpiringSoonCard } from "./ExpiringSoonCard.tsx";
import { MonthPnlSheet } from "./MonthPnlSheet.tsx";
import { isSameMonth, type Month, monthAfter, monthLabel, monthOf, monthRange } from "./month.ts";

/** The month's totals at a glance, its sheet machine by machine, then what's about to expire. */
export function DashboardScreen() {
  const thisMonth = monthOf(new Date());
  const [month, setMonth] = useState<Month>(thisMonth);
  const sheet = useQuery(trpc.pnl.sheet.queryOptions(monthRange(month)));
  const totals = sheet.data?.totals;

  return (
    <Page max="wide" className="grid gap-6">
      <PageHeader
        title="Dashboard"
        meta="Sales and profit are worked out from your visit counts and what you paid."
      />

      <MonthSwitcher month={month} isLatest={isSameMonth(month, thisMonth)} onChange={setMonth} />

      {totals ? <ProfitKpiGrid totals={totals} revenueLabel="Gross sales" /> : null}

      <MonthPnlSheet month={month} sheet={sheet} />
      <ExpiringSoonCard />
    </Page>
  );
}

/** ‹ November 2026 ›. No months after this one: nothing has been counted there. */
function MonthSwitcher({
  month,
  isLatest,
  onChange,
}: {
  month: Month;
  isLatest: boolean;
  onChange: (month: Month) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <IconButton
        label="Previous month"
        className="text-xl"
        onClick={() => onChange(monthAfter(month, -1))}
      >
        ‹
      </IconButton>
      <p className="min-w-44 text-center font-display text-heading text-ink" aria-live="polite">
        {monthLabel(month)}
      </p>
      <IconButton
        className="text-xl"
        label="Next month"
        disabled={isLatest}
        onClick={() => onChange(monthAfter(month, 1))}
      >
        ›
      </IconButton>
    </div>
  );
}
