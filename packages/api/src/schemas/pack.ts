import { z } from "zod";
import type { Pack } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const packDto = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Case-level barcodes, normalized to GTIN-14. */
    barcodes: z
      .array(z.string())
      .describe("Case-level barcodes, normalized to GTIN-14."),
    contents: z.array(
      z.object({ productId: z.string(), units: z.number().int() }),
    ),
    active: z.boolean(),
    createdAt: z.string().meta({ format: "date-time" }),
    updatedAt: z.string().meta({ format: "date-time" }),
  })
  .meta({ id: "Pack" });

export type PackDtoMatches = Assert<Equal<z.infer<typeof packDto>, Pack>>;
