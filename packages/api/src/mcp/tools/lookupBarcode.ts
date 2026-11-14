import { z } from "zod";
import { BUSINESS_PARAM, defineTool } from "./AgentTool.ts";
import { formatMoney, pluralize } from "./format.ts";
import { buildProductNames, nameOr } from "./lookups.ts";

/**
 * The resolver already answers the question the model would otherwise guess at:
 * is this code a product we stock, a case we buy, something a public catalog
 * knows, or nothing at all. Each branch is narrated differently so the model
 * proposes the right next step instead of treating "candidate" as a product it
 * can sell.
 */
export const lookupBarcode = defineTool({
  name: "lookup_barcode",
  title: "Look up a barcode",
  description:
    "Identifies a scanned or typed barcode: one of your products, one of your case packs, something only an outside catalog knows, or unrecognized. Use it before recording a purchase from a receipt or a scan.",
  inputSchema: {
    ...BUSINESS_PARAM,
    barcode: z.string().describe("The barcode digits, as scanned or typed."),
  },
  // Falls through to a public product catalog when the code is not one of ours.
  readsOutsideWorld: true,
  execute: async (input, scope) => {
    const resolution = await scope.services.barcodeResolverService.resolve(
      scope.orgId,
      input.barcode,
    );

    if (resolution.status === "invalid") {
      return {
        text: `"${resolution.raw}" is not a valid barcode — the digits do not check out. Re-read or re-type it.`,
        data: { status: resolution.status, raw: resolution.raw },
      };
    }

    if (resolution.status === "product") {
      const { product } = resolution;
      return {
        text: `${resolution.gtin14} is ${product.name}, already in the catalog (${product.category}, suggested ${formatMoney(product.defaultPriceCents)}). Product id ${product.id}.`,
        data: {
          status: resolution.status,
          gtin14: resolution.gtin14,
          product: {
            id: product.id,
            name: product.name,
            category: product.category,
            upc: product.upc,
            suggestedPriceCents: product.defaultPriceCents,
            tracksExpiration: product.tracksExpiration,
            active: product.active,
          },
        },
      };
    }

    if (resolution.status === "pack") {
      const { pack } = resolution;
      const productNames = await buildProductNames(scope);
      const contents = pack.contents.map((content) => ({
        productId: content.productId,
        productName: nameOr(productNames, content.productId),
        units: content.units,
      }));
      const breakdown = contents
        .map((content) => `${pluralize(content.units, "unit")} of ${content.productName}`)
        .join(", ");
      return {
        text: `${resolution.gtin14} is the case pack "${pack.name}" — ${breakdown}. Pack id ${pack.id}.`,
        data: {
          status: resolution.status,
          gtin14: resolution.gtin14,
          pack: { id: pack.id, name: pack.name, active: pack.active, contents },
        },
      };
    }

    // A case code scanned at a warehouse club is the common reason a code is
    // unknown, and it changes the advice: create a PACK, not a product.
    const caseHint = resolution.likelyCase
      ? " The code looks like a case barcode, so this is probably a multi-unit pack rather than a single sellable item."
      : "";

    if (resolution.status === "candidate") {
      const { item } = resolution;
      const described = [item.brand, item.name]
        .filter((part): part is string => part !== null && part !== "")
        .join(" ");
      return {
        text: `${resolution.gtin14} is not in ${scope.orgName}'s catalog yet. An outside catalog calls it "${described === "" ? "an unnamed item" : described}".${caseHint} Nothing has been created — creating it is a separate step.`,
        data: {
          status: resolution.status,
          gtin14: resolution.gtin14,
          likelyCase: resolution.likelyCase,
          suggestion: { name: item.name, brand: item.brand, imageUrl: item.imageUrl },
        },
      };
    }

    return {
      text: `${resolution.gtin14} is not in ${scope.orgName}'s catalog and no outside catalog recognizes it.${caseHint} It would have to be entered by hand.`,
      data: {
        status: resolution.status,
        gtin14: resolution.gtin14,
        likelyCase: resolution.likelyCase,
      },
    };
  },
});
