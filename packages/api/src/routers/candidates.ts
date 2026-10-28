import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { candidateDto } from "../schemas/index.ts";

// A candidate is what an outside database (Open Food Facts) says a barcode
// might name — prefill-only, never a fact about the org's catalog. The org's
// own records are "the catalog"; these are not it.
export const candidatesRouter = router({
  // External lookup for one code — returns name/brand/image, or null.
  byUpc: orgProtectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/barcode-candidate",
        tags: ["candidates"],
        protect: true,
        operationId: "getBarcodeCandidate",
        summary: "What an outside database says a barcode might name",
        errorResponses: {
          401: "Authorization not provided",
          403: "Insufficient access",
          426: "This build is below the supported floor; the client must update.",
          500: "Internal server error",
        },
      },
    })
    .input(z.object({ code: z.string().min(1) }))
    .output(candidateDto.nullable())
    .query(({ ctx, input }) =>
      ctx.services.productDataService.lookup(input.code),
    ),

  // External text search — returns ranked matches with barcodes.
  search: orgProtectedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ ctx, input }) =>
      ctx.services.productDataService.search(input.query),
    ),
});
