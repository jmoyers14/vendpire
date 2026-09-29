import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

export const barcodesRouter = router({
  /**
   * "What is this barcode?" — own product, own pack, an outside-catalog
   * candidate we could create, or unknown. Backs scan-first purchase entry
   * and, later, the iOS scanner.
   */
  resolve: orgProtectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.barcodeResolverService.resolve(ctx.auth.orgId, input.code),
    ),
});
