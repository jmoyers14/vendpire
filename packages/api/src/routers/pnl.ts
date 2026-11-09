import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { instant, objectId } from "./validators.ts";

/** The client computes the month's bounds, so "October" is the operator's October. */
export const pnlSheetInput = z
  .object({ from: instant(), to: instant() })
  .refine((range) => Date.parse(range.from) <= Date.parse(range.to), {
    message: "to must not be before from",
  });

export const pnlRouter = router({
  byMachine: orgProtectedProcedure
    .input(
      z.object({
        machineId: objectId(),
        from: instant().optional(),
        to: instant().optional(),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.services.pnlService.byMachine(ctx.auth.orgId, input.machineId, {
        from: input.from ?? null,
        to: input.to ?? null,
      }),
    ),

  sheet: orgProtectedProcedure
    .input(pnlSheetInput)
    .query(({ ctx, input }) =>
      ctx.services.pnlService.sheet(ctx.auth.orgId, input),
    ),
});
