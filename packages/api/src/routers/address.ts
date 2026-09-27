import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

export const addressRouter = router({
  autocomplete: orgProtectedProcedure
    .input(
      z.object({
        input: z.string(),
        sessionToken: z.string().optional(),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.services.addressService.suggest(input.input, input.sessionToken),
    ),

  resolve: orgProtectedProcedure
    .input(
      z.object({
        placeId: z.string().min(1),
        sessionToken: z.string().optional(),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.services.addressService.resolve(input.placeId, input.sessionToken),
    ),
});
