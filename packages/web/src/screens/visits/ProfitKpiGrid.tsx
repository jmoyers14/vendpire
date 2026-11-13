import { KpiCard, KpiGrid, profitToneFor } from "../../ui.tsx";
import { formatCents, formatCentsOrUnknown, formatSignedCentsOrUnknown } from "../../utils/money.ts";

export interface ProfitTotals {
  revenueCents: number;
  /** Null while some item has no purchase recorded. */
  cogsCents: number | null;
  grossProfitCents: number | null;
  netProfitCents: number | null;
}

/** Sales, COGS, gross profit and what's left after write-offs, as four KPI cards. */
export function ProfitKpiGrid({
  totals,
  revenueLabel,
}: {
  totals: ProfitTotals;
  /** The page's own word for sales, so the cards match the table under them. */
  revenueLabel: string;
}) {
  return (
    <KpiGrid>
      <KpiCard label={revenueLabel} value={formatCents(totals.revenueCents)} />
      <KpiCard label="COGS" value={formatCentsOrUnknown(totals.cogsCents)} />
      <KpiCard
        label="Gross profit"
        value={formatSignedCentsOrUnknown(totals.grossProfitCents)}
        tone={profitToneFor(totals.grossProfitCents)}
      />
      {/* "After write-offs", not "Net profit": there are no operating
          expenses in v1 — no fuel, labour or depreciation — so this is
          net of the goods you lost, not net of running the route.
          "Write-off" is the domain's word; "waste" was a synonym that
          sent a reader looking for a third concept. */}
      <KpiCard
        label="After write-offs"
        value={formatSignedCentsOrUnknown(totals.netProfitCents)}
        tone={profitToneFor(totals.netProfitCents)}
      />
    </KpiGrid>
  );
}
