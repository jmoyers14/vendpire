import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

const purchaseInput = z.object({
  purchasedAt: z.string().datetime(),
  vendor: z.string().min(1),
  // Lines already denominated in sellable units. packId is provenance for
  // lines that came from a pack (preserved when editing).
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        units: z.number().int().min(1),
        totalCostCents: z.number().int().min(0),
        packId: z.string().nullable().default(null),
      }),
    )
    .default([]),
  // Lines as the receipt reads them — N packs for one total. Expanded into
  // per-product unit lines by the service.
  packLines: z
    .array(
      z.object({
        packId: z.string().min(1),
        qty: z.number().int().min(1),
        totalCostCents: z.number().int().min(0),
      }),
    )
    .default([]),
  receiptTotalCents: z.number().int().min(0).nullable().default(null),
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
