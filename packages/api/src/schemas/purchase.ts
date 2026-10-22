import { z } from "zod";
import type { Purchase } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const purchaseDto = z
  .object({
    id: z.string(),
    purchasedAt: z.string().meta({ format: "date-time" }),
    vendor: z.string(),
    lines: z.array(
      z.object({
        productId: z.string(),
        units: z.number(),
        /** The TOTAL for the line, not a unit cost — the receipt's number. */
        totalCostCents: z
          .number()
          .describe("The TOTAL for the line, not a unit cost — the receipt's number."),
        packId: z.string().nullable(),
      }),
    ),
    receiptTotalCents: z.number().nullable(),
    notes: z.string().nullable(),
    clientRequestId: z.string(),
    createdAt: z.string().meta({ format: "date-time" }),
    updatedAt: z.string().meta({ format: "date-time" }),
  })
  .meta({ id: "Purchase" });

export type PurchaseDtoMatches = Assert<
  Equal<z.infer<typeof purchaseDto>, Purchase>
>;
