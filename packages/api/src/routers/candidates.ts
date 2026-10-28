import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

// A candidate is what an outside database (Open Food Facts) says a barcode
// might name — prefill-only, never a fact about the org's catalog. The org's
// own records are "the catalog"; these are not it.
export const candidatesRouter = router({
  // External lookup for one code — returns name/brand/image, or null.
  byUpc: orgProtectedProcedure
    .input(z.object({ code: z.string().min(1) }))
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
