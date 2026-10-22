import { z } from "zod";
import type { Product } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const productDto = z
  .object({
    id: z.string(),
    name: z.string(),
    /** The UNIT barcode, null until verified. */
    upc: z.string().nullable().describe("The UNIT barcode, null until verified."),
    category: z.string(),
    taxClass: z.string().nullable(),
    imageUrl: z.string().nullable(),
    defaultPriceCents: z.number(),
    active: z.boolean(),
    tracksExpiration: z.boolean(),
    createdAt: z.string().meta({ format: "date-time" }),
    updatedAt: z.string().meta({ format: "date-time" }),
  })
  .meta({ id: "Product" });

export type ProductDtoMatches = Assert<
  Equal<z.infer<typeof productDto>, Product>
>;
