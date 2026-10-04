import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

// Each arm carries only its own payload — the shape the entity now uses, so
// the parsed input reaches the service needing no reshaping. Unknown keys are
// stripped, so a client still sending the old null padding is accepted.
const commissionInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("percent"),
    percentBps: z.number().int().min(1).max(10_000),
    basis: z.enum(["gross", "net"]).default("gross"),
  }),
  z.object({
    type: z.literal("flat"),
    flatCents: z.number().int().min(1),
  }),
]);

const locationInput = z.object({
  name: z.string().min(1),
  address: z.object({
    line1: z.string().nullable().default(null),
    city: z.string().nullable().default(null),
    state: z.string().nullable().default(null),
    zip: z.string().nullable().default(null),
    geo: z
      .object({ lat: z.number(), lng: z.number() })
      .nullable()
      .default(null),
  }),
  contact: z.object({
    name: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
    email: z.string().nullable().default(null),
  }),
  commission: commissionInput,
  notes: z.string().nullable().default(null),
  active: z.boolean().default(true),
});

export const locationsRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.locationService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.locationService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(locationInput)
    .mutation(async ({ ctx, input }) => {
      const location = await ctx.services.locationService.create(
        ctx.auth.orgId,
        input,
      );
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.LOCATION_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: { locationId: location.id },
      });
      return location;
    }),

  update: orgProtectedProcedure
    .input(locationInput.extend({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.locationService.update(ctx.auth.orgId, id, data);
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.locationService.remove(ctx.auth.orgId, input.id),
    ),
});
