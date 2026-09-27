import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

const purchaseInput = z.object({
  purchasedAt: z.string().datetime(),
  vendor: z.string().min(1),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        units: z.number().int().min(1),
        totalCostCents: z.number().int().min(0),
      }),
    )
    .min(1),
  notes: z.string().nullable().default(null),
});

export const purchasesRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.purchaseService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.purchaseService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(purchaseInput)
    .mutation(async ({ ctx, input }) => {
      const purchase = await ctx.services.purchaseService.create(
        ctx.auth.orgId,
        input,
      );
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.PURCHASE_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: {
          purchaseId: purchase.id,
          vendor: purchase.vendor,
          lineCount: purchase.lines.length,
        },
      });
      return purchase;
    }),

  update: orgProtectedProcedure
    .input(purchaseInput.extend({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.purchaseService.update(ctx.auth.orgId, id, data);
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.purchaseService.remove(ctx.auth.orgId, input.id),
    ),
});
