import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { trpc } from "../../trpc.ts";
import {
  ErrorNote,
  IconButton,
  KpiCard,
  KpiGrid,
  kpiToneFor,
  Page,
  PageHeader,
} from "../../ui.tsx";
import { formatCents, formatSignedCents } from "../../utils/money.ts";
import { ExpiringSoonCard } from "./ExpiringSoonCard.tsx";
import { MonthPnlSheet } from "./MonthPnlSheet.tsx";
import { isSameMonth, type Month, monthAfter, monthLabel, monthOf, monthRange } from "./month.ts";

/** Unknown is never a number; the sheet's notes say why. */
const UNKNOWN = "—";

const signedMoney = (cents: number | null): string =>
  cents === null ? UNKNOWN : formatSignedCents(cents);

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

      <ErrorNote
        message={sheet.error ? `Couldn't load ${monthLabel(month)}: ${sheet.error.message}` : null}
      />

      {totals ? (
        <KpiGrid>
          <KpiCard label="Gross sales" value={formatCents(totals.revenueCents)} />
          <KpiCard
            label="COGS"
            value={totals.cogsCents === null ? UNKNOWN : formatCents(totals.cogsCents)}
          />
          <KpiCard
            label="Gross profit"
            value={signedMoney(totals.grossProfitCents)}
            tone={kpiToneFor(totals.grossProfitCents)}
          />
          <KpiCard
            label="After write-offs"
            value={signedMoney(totals.netProfitCents)}
            tone={kpiToneFor(totals.netProfitCents)}
          />
        </KpiGrid>
      ) : null}

      <MonthPnlSheet month={month} sheet={sheet.data} isLoading={sheet.isLoading} />
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
      <h2 className="min-w-44 text-center font-display text-heading text-ink" aria-live="polite">
        {monthLabel(month)}
      </h2>
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
