import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";
import { objectId } from "./validators.ts";

const packInput = z.object({
  name: z.string().min(1),
  barcodes: z.array(z.string().min(1)).default([]),
  contents: z
    .array(
      z.object({
        productId: objectId(),
        units: z.number().int().min(1),
      }),
    )
    .min(1),
  active: z.boolean().default(true),
});

export const packsRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.packService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: objectId() }))
    .query(({ ctx, input }) =>
      ctx.services.packService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(packInput)
    .mutation(async ({ ctx, input }) => {
      const pack = await ctx.services.packService.create(ctx.auth.orgId, input);
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.PACK_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: { packId: pack.id, contentCount: pack.contents.length },
      });
      return pack;
    }),

  update: orgProtectedProcedure
    .input(packInput.extend({ id: objectId() }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.packService.update(ctx.auth.orgId, id, data);
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: objectId() }))
    .mutation(({ ctx, input }) =>
      ctx.services.packService.remove(ctx.auth.orgId, input.id),
    ),
});
