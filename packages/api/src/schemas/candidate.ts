import { z } from "zod";
import type { ProductData } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

// What an outside database says a barcode might be. Every field can be null —
// the provider often has partial data — and the whole thing is null when the
// code is unrecognized.
export const candidateDto = z
  .object({
    name: z.string().nullable(),
    brand: z.string().nullable(),
    imageUrl: z.string().nullable(),
  })
  .meta({ id: "Candidate" });

export type CandidateDtoMatches = Assert<Equal<z.infer<typeof candidateDto>, ProductData>>;
