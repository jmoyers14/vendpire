import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

const machineTemplateInput = z.object({
  name: z.string().min(1),
  kind: z.enum(["snack", "drink", "combo"]),
  make: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  // One array per shelf, slot codes in walking order — same shape as a machine.
  slots: z.array(z.array(z.string().min(1))).default([]),
});

export const machineTemplatesRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.machineTemplateService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.machineTemplateService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(machineTemplateInput)
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.services.machineTemplateService.create(
        ctx.auth.orgId,
        input,
      );
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.MACHINE_TEMPLATE_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: {
          machineTemplateId: template.id,
          kind: template.kind,
          slotCount: template.slots.flat().length,
        },
      });
      return template;
    }),

  update: orgProtectedProcedure
    .input(machineTemplateInput.extend({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.machineTemplateService.update(
        ctx.auth.orgId,
        id,
        data,
      );
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.machineTemplateService.remove(ctx.auth.orgId, input.id),
    ),
});
