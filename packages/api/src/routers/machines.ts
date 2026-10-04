import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

const machineInput = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["snack", "drink", "combo"]),
  make: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  serial: z.string().nullable().default(null),
  tagCode: z.string().nullable().default(null),
  // Layout lineage — the template this face came from, or was saved off.
  templateId: z.string().nullable().default(null),
  // One array per shelf, slot codes in walking order.
  slots: z.array(z.array(z.string().min(1))).default([]),
  cardReader: z
    .object({
      provider: z.enum(["nayax", "cantaloupe"]),
      deviceId: z.string().min(1),
    })
    .nullable()
    .default(null),
  active: z.boolean().default(true),
});

export const machinesRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.machineService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.machineService.get(ctx.auth.orgId, input.id),
    ),

  // QR-sticker lookup: the phone scans a tag and lands on the machine.
  getByTagCode: orgProtectedProcedure
    .input(z.object({ tagCode: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.machineService.getByTagCode(ctx.auth.orgId, input.tagCode),
    ),

  create: orgProtectedProcedure
    .input(machineInput)
    .mutation(async ({ ctx, input }) => {
      const machine = await ctx.services.machineService.create(
        ctx.auth.orgId,
        input,
      );
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.MACHINE_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: { machineId: machine.id, kind: machine.kind },
      });
      return machine;
    }),

  update: orgProtectedProcedure
    .input(machineInput.extend({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.machineService.update(ctx.auth.orgId, id, data);
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.machineService.remove(ctx.auth.orgId, input.id),
    ),
});
