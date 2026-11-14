import { z } from "zod";
import { BUSINESS_PARAM, defineTool } from "./AgentTool.ts";
import { formatDay, formatMoney, pluralize } from "./format.ts";
import { buildProductNames, nameOr } from "./lookups.ts";

const DEFAULT_LIMIT = 20;

/**
 * Supply runs. Costs are stored per LINE as a total, never as a unit price —
 * $14.99 for 30 does not divide evenly — so the per-unit figure shown here is
 * derived for readability and is not what the system costs against.
 */
export const recentPurchases = defineTool({
  name: "recent_purchases",
  title: "Recent purchases",
  description:
    "Lists recent stock purchases, newest first: vendor, date, what was bought and what it cost. Use this to answer what was spent on inventory, or when a product was last restocked.",
  inputSchema: {
    ...BUSINESS_PARAM,
    from: z
      .string()
      .optional()
      .describe("Earliest purchase date to include, as YYYY-MM-DD."),
    to: z.string().optional().describe("Latest purchase date to include, as YYYY-MM-DD."),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .optional()
      .describe(`How many purchases to return. Defaults to ${DEFAULT_LIMIT}.`),
  },
  execute: async (input, scope) => {
    const [page, productNames] = await Promise.all([
      scope.services.purchaseService.list(scope.orgId, {
        from: input.from ?? null,
        to: input.to ?? null,
        limit: input.limit ?? DEFAULT_LIMIT,
      }),
      buildProductNames(scope),
    ]);

    const rows = page.items.map((purchase) => {
      const lineTotal = purchase.lines.reduce(
        (sum, line) => sum + line.totalCostCents,
        0,
      );
      return {
        id: purchase.id,
        purchasedAt: purchase.purchasedAt,
        vendor: purchase.vendor,
        lineTotalCents: lineTotal,
        receiptTotalCents: purchase.receiptTotalCents,
        notes: purchase.notes,
        lines: purchase.lines.map((line) => ({
          productId: line.productId,
          productName: nameOr(productNames, line.productId),
          units: line.units,
          totalCostCents: line.totalCostCents,
          fromPack: line.packId !== null,
        })),
      };
    });

    if (rows.length === 0) {
      return {
        text: `No purchases found for ${scope.orgName} in that window.`,
        data: { business: scope.orgName, purchases: [], nextCursor: null },
      };
    }

    const blocks = rows.map((row) => {
      const lines = row.lines.map(
        (line) =>
          `    ${line.productName}: ${pluralize(line.units, "unit")} for ${formatMoney(line.totalCostCents)}`,
      );
      // A receipt total that disagrees with the lines is a real signal — tax,
      // a missed line, a typo — so it is surfaced rather than reconciled away.
      const mismatch =
        row.receiptTotalCents !== null &&
        row.receiptTotalCents !== row.lineTotalCents
          ? `\n    (receipt says ${formatMoney(row.receiptTotalCents)}, lines add to ${formatMoney(row.lineTotalCents)})`
          : "";
      const notes = row.notes === null ? "" : `\n    note: ${row.notes}`;
      return `- ${formatDay(row.purchasedAt)} — ${row.vendor}, ${formatMoney(row.lineTotalCents)}\n${lines.join("\n")}${mismatch}${notes}`;
    });

    const more =
      page.nextCursor === null ? "" : "\n\nMore purchases exist before these.";

    return {
      text: `${pluralize(rows.length, "purchase")}, newest first:\n${blocks.join("\n")}${more}`,
      data: {
        business: scope.orgName,
        purchases: rows,
        nextCursor: page.nextCursor,
      },
    };
  },
});
