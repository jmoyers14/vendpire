import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

const planogramInput = z.object({
  machineId: z.string().min(1),
  // Defaults to "now": most new versions take effect the moment you save them.
  effectiveFrom: z
    .string()
    .datetime()
    .default(() => new Date().toISOString()),
  slots: z
    .array(
      z.object({
        slotCode: z.string().min(1),
        productId: z.string().min(1),
        par: z.number().int().min(1),
        // min(1): products created mid-purchase can carry a $0 placeholder
        // price; a slot is where that becomes real money, so it must be set.
        priceCents: z
          .number()
          .int()
          .min(1, "Slot price must be set before a planogram goes live"),
      }),
    )
    .min(1),
});

export const planogramsRouter = router({
  listByMachine: orgProtectedProcedure
    .input(z.object({ machineId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.planogramService.listByMachine(
        ctx.auth.orgId,
        input.machineId,
      ),
    ),

  getCurrent: orgProtectedProcedure
    .input(z.object({ machineId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.planogramService.getCurrent(ctx.auth.orgId, input.machineId),
    ),

  listCurrentByOrg: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.planogramService.listCurrentByOrg(ctx.auth.orgId),
  ),

  // Immutable versions: no update/remove. A layout change is a new create.
  create: orgProtectedProcedure
    .input(planogramInput)
    .mutation(async ({ ctx, input }) => {
      const planogram = await ctx.services.planogramService.create(
        ctx.auth.orgId,
        input,
      );
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.PLANOGRAM_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: {
          machineId: planogram.machineId,
          slotCount: planogram.slots.length,
        },
      });
      return planogram;
    }),
});
