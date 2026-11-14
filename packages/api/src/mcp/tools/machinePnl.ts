import type { VisitAnomaly } from "@zenvend/domain";
import { z } from "zod";
import { BUSINESS_PARAM, defineTool } from "./AgentTool.ts";
import { formatMoney, formatMoneyOrUnknown, pluralize } from "./format.ts";
import { buildProductNames, nameOr, resolveMachine } from "./lookups.ts";

interface ProductTotals {
  productId: string;
  productName: string;
  unitsSold: number;
  revenueCents: number;
  /** Null the moment ONE interval's cost is unknown. Never a partial sum. */
  cogsCents: number | null;
  /** Intervals with no sold figure at all, so this row understates. */
  unknownIntervals: number;
}

/**
 * `par` is a placeholder 10 on every slot in the system, so every well-stocked
 * machine trips over-par. Reporting it would train the user to ignore the
 * anomaly list, which is where the real warnings live.
 */
const isNoise = (anomaly: VisitAnomaly): boolean => anomaly.kind === "over-par";

const describeAnomaly = (anomaly: VisitAnomaly): string => {
  switch (anomaly.kind) {
    case "negative-sold":
      return `slot ${anomaly.slotCode} counted ${anomaly.units} sold — stock was added outside a visit, or a count is wrong`;
    case "no-baseline":
      return `slot ${anomaly.slotCode} has no earlier visit to measure against (${anomaly.reason}), so nothing it sold is counted here`;
    case "product-changed":
      return `slot ${anomaly.slotCode} changed product without the old one being counted out, so its last interval is unrecoverable`;
    case "slot-not-counted":
      return `slot ${anomaly.slotCode} was skipped on a visit, so its interval is missing`;
    case "over-removed":
      return `slot ${anomaly.slotCode} had more pulled out than was in it`;
    case "unknown-removal-reason":
      return `slot ${anomaly.slotCode} had units pulled with no reason recorded, so they count as neither a loss nor a transfer`;
    case "unknown-cost":
      return "a product sold here has no purchase history, so its cost is unknown";
    default:
      return anomaly.kind;
  }
};

/**
 * Product-level profitability for one machine. Every money figure that can be
 * null IS null here rather than zero, and the narration says so in words —
 * a model shown `cogsCents: 0` reports a business with free inventory.
 */
export const machinePnl = defineTool({
  name: "machine_pnl",
  title: "Machine profit and loss",
  description:
    "Revenue, cost of goods, write-offs and net profit for one machine over a date range, broken down by product. Costs can legitimately be unknown when a product has no purchase history — when this says a figure is unknown, report it as unknown and never as zero.",
  inputSchema: {
    ...BUSINESS_PARAM,
    machine: z
      .string()
      .describe("The machine's name, tag code, or id — a partial name is fine."),
    from: z
      .string()
      .optional()
      .describe("Start of the window, as YYYY-MM-DD. Defaults to all history."),
    to: z.string().optional().describe("End of the window, as YYYY-MM-DD."),
  },
  execute: async (input, scope) => {
    const machine = await resolveMachine(scope, input.machine);
    const [pnl, productNames] = await Promise.all([
      scope.services.pnlService.byMachine(scope.orgId, machine.id, {
        from: input.from ?? null,
        to: input.to ?? null,
      }),
      buildProductNames(scope),
    ]);

    const byProduct = new Map<string, ProductTotals>();
    const totalsFor = (productId: string): ProductTotals => {
      const existing = byProduct.get(productId);
      if (existing !== undefined) {
        return existing;
      }
      const fresh: ProductTotals = {
        productId,
        productName: nameOr(productNames, productId),
        unitsSold: 0,
        revenueCents: 0,
        cogsCents: 0,
        unknownIntervals: 0,
      };
      byProduct.set(productId, fresh);
      return fresh;
    };

    for (const row of pnl.rows.intervals) {
      const totals = totalsFor(row.interval.productId);
      if (row.interval.sold.status === "unknown") {
        totals.unknownIntervals += 1;
        continue;
      }
      totals.unitsSold += row.interval.sold.units;
      totals.revenueCents += row.revenueCents;
      totals.cogsCents =
        row.cogsCents === null || totals.cogsCents === null
          ? null
          : totals.cogsCents + row.cogsCents;
    }

    const products = [...byProduct.values()].sort(
      (left, right) => right.revenueCents - left.revenueCents,
    );
    const anomalies = pnl.anomalies.filter((anomaly) => !isNoise(anomaly));

    const data = {
      business: scope.orgName,
      machine: { id: machine.id, name: machine.name },
      from: pnl.from,
      to: pnl.to,
      totals: pnl.totals,
      products,
      anomalies,
    };

    const window =
      pnl.from === null && pnl.to === null
        ? "all time"
        : `${pnl.from ?? "the beginning"} to ${pnl.to ?? "now"}`;

    const summary = [
      `${machine.name}, ${window}:`,
      `  Revenue:      ${formatMoney(pnl.totals.revenueCents)}`,
      `  COGS:         ${formatMoneyOrUnknown(pnl.totals.cogsCents)}`,
      `  Gross profit: ${formatMoneyOrUnknown(pnl.totals.grossProfitCents)}`,
      `  Write-offs:   ${formatMoneyOrUnknown(pnl.totals.writeOffCents)} (${pluralize(pnl.totals.writeOffUnits, "unit")})`,
      `  Net profit:   ${formatMoneyOrUnknown(pnl.totals.netProfitCents)}`,
    ];

    if (pnl.totals.returnedToStockUnits > 0) {
      summary.push(
        `  ${pluralize(pnl.totals.returnedToStockUnits, "unit")} moved to other stock — still yours, so no cost is charged here.`,
      );
    }

    const caveats: string[] = [];
    if (pnl.totals.cogsCents === null) {
      caveats.push(
        `COGS is unknown, not zero: ${pluralize(pnl.totals.unknownCostRows, "interval")} on products with no purchase history to cost against. Gross and net profit are unknown for the same reason.`,
      );
    }
    if (pnl.totals.unknownSoldRows > 0) {
      caveats.push(
        `${pluralize(pnl.totals.unknownSoldRows, "interval")} have no sold figure, so revenue here is a floor, not a total.`,
      );
    }
    if (pnl.totals.unknownRemovalReasonRows > 0) {
      caveats.push(
        `${pluralize(pnl.totals.unknownRemovalReasonRows, "removal")} have no reason recorded, so they count as neither a write-off nor a transfer.`,
      );
    }

    const productLines =
      products.length === 0
        ? ["  (no product rows in this window)"]
        : products.map((product) => {
            const unknown =
              product.unknownIntervals === 0
                ? ""
                : ` — ${pluralize(product.unknownIntervals, "interval")} unmeasured`;
            return `  ${product.productName}: ${pluralize(product.unitsSold, "unit")}, ${formatMoney(product.revenueCents)} revenue, ${formatMoneyOrUnknown(product.cogsCents)} cost${unknown}`;
          });

    const sections = [summary.join("\n"), `By product:\n${productLines.join("\n")}`];
    if (caveats.length > 0) {
      sections.push(`What this does not know:\n${caveats.map((caveat) => `  - ${caveat}`).join("\n")}`);
    }
    if (anomalies.length > 0) {
      sections.push(
        `Data quality:\n${anomalies.map((anomaly) => `  - ${describeAnomaly(anomaly)}`).join("\n")}`,
      );
    }

    return { text: sections.join("\n\n"), data };
  },
});
