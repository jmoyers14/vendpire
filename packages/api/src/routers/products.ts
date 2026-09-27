import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

const productInput = z.object({
  name: z.string().min(1),
  upc: z.string().nullable().default(null),
  category: z.string().min(1),
  taxClass: z.string().nullable().default(null),
  defaultPriceCents: z.number().int().min(0),
  active: z.boolean().default(true),
});

export const productsRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.productService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.productService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(productInput)
    .mutation(async ({ ctx, input }) => {
      const product = await ctx.services.productService.create(
        ctx.auth.orgId,
        input,
      );
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.PRODUCT_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: { productId: product.id, category: product.category },
      });
      return product;
    }),

  update: orgProtectedProcedure
    .input(productInput.extend({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.productService.update(ctx.auth.orgId, id, data);
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.productService.remove(ctx.auth.orgId, input.id),
    ),
});
