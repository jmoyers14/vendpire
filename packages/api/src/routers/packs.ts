import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";
import { packDto } from "../schemas/index.ts";
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
  list: orgProtectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/packs",
        tags: ["packs"],
        protect: true,
        operationId: "listPacks",
        summary: "Every pack in the organization",
        errorResponses: {
          401: "Authorization not provided",
          403: "Insufficient access",
          426: "This build is below the supported floor; the client must update.",
          500: "Internal server error",
        },
      },
    })
    .input(z.void())
    .output(z.array(packDto))
    .query(({ ctx }) => ctx.services.packService.list(ctx.auth.orgId)),

  get: orgProtectedProcedure
    .input(z.object({ id: objectId() }))
    .query(({ ctx, input }) =>
      ctx.services.packService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/packs",
        tags: ["packs"],
        protect: true,
        operationId: "createPack",
        summary: "Create a way of buying — a case with its own barcodes",
        errorResponses: {
          400: "Invalid input data",
          401: "Authorization not provided",
          403: "Insufficient access",
          409: "The barcode already belongs to another record",
          426: "This build is below the supported floor; the client must update.",
          500: "Internal server error",
        },
      },
    })
    .input(packInput)
    .output(packDto)
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

  attachBarcode: orgProtectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/packs/{id}/barcode",
        tags: ["packs"],
        protect: true,
        operationId: "attachPackBarcode",
        summary: "Attach a scanned unit barcode to an existing pack",
        errorResponses: {
          400: "Invalid input data",
          401: "Authorization not provided",
          403: "Insufficient access",
          404: "No such pack",
          409: "The barcode already belongs to another record",
          426: "This build is below the supported floor; the client must update.",
          500: "Internal server error",
        },
      },
    })
    .input(z.object({ id: objectId(), code: z.string().min(1) }))
    .output(packDto)
    .mutation(({ ctx, input }) =>
      ctx.services.packService.attachBarcode(ctx.auth.orgId, input.id, input.code),
    ),
});
