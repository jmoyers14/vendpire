import { z } from "zod";
import { BUSINESS_PARAM, defineTool } from "./AgentTool.ts";
import { formatMoney, pluralize } from "./format.ts";

const DEFAULT_LIMIT = 25;

/**
 * The catalog. `defaultPriceCents` is reported as what it is — a suggestion for
 * new slots — because the price a machine actually charges lives on the slot,
 * and quoting the default as "the price" would misstate revenue.
 */
export const findProduct = defineTool({
  name: "find_product",
  title: "Find a product",
  description:
    "Searches the product catalog by name, category, or barcode. Returns the product id other tools need, plus its suggested price. The price a machine actually charges is set per slot, not here.",
  inputSchema: {
    ...BUSINESS_PARAM,
    query: z
      .string()
      .optional()
      .describe("Part of a name, category, or UPC. Omit to list everything."),
    includeInactive: z
      .boolean()
      .optional()
      .describe("Include discontinued products. Defaults to false."),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .optional()
      .describe(`Maximum products to return. Defaults to ${DEFAULT_LIMIT}.`),
  },
  execute: async (input, scope) => {
    const products = await scope.services.productService.list(scope.orgId);
    const wanted = input.query?.trim().toLowerCase() ?? "";

    const matched = products
      .filter((product) => input.includeInactive === true || product.active)
      .filter((product) => {
        if (wanted === "") {
          return true;
        }
        return (
          product.name.toLowerCase().includes(wanted) ||
          product.category.toLowerCase().includes(wanted) ||
          product.upc?.toLowerCase().includes(wanted) === true
        );
      });

    const limit = input.limit ?? DEFAULT_LIMIT;
    const rows = matched.slice(0, limit).map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      upc: product.upc,
      suggestedPriceCents: product.defaultPriceCents,
      tracksExpiration: product.tracksExpiration,
      active: product.active,
    }));

    if (rows.length === 0) {
      const what = wanted === "" ? "any products" : `products matching "${input.query}"`;
      return {
        text: `${scope.orgName} has no ${what} on file.`,
        data: { business: scope.orgName, products: [], totalMatched: 0 },
      };
    }

    const lines = rows.map((row) => {
      const upc = row.upc === null ? "no UPC" : `UPC ${row.upc}`;
      const retired = row.active ? "" : ", DISCONTINUED";
      return `- ${row.name} (${row.category}) — ${upc}, suggested ${formatMoney(row.suggestedPriceCents)}${retired}`;
    });

    const truncated =
      matched.length > rows.length
        ? `\n(${matched.length - rows.length} more matched; narrow the query or raise the limit.)`
        : "";

    return {
      text: `${pluralize(rows.length, "product")}:\n${lines.join("\n")}${truncated}`,
      data: {
        business: scope.orgName,
        products: rows,
        totalMatched: matched.length,
      },
    };
  },
});
