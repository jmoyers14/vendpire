import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";
import { productDto } from "../schemas/index.ts";
import { objectId } from "./validators.ts";

const productInput = z.object({
  name: z.string().min(1),
  upc: z.string().nullable().default(null),
  category: z.string().min(1),
  taxClass: z.string().nullable().default(null),
  imageUrl: z.url().nullable().default(null),
  defaultPriceCents: z.number().int().min(0),
  active: z.boolean().default(true),
  tracksExpiration: z.boolean().default(true),
});

export const productsRouter = router({
  list: orgProtectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/products",
        tags: ["products"],
        protect: true,
        operationId: "listProducts",
        summary: "Every product in the organization",
        errorResponses: {
          401: "Authorization not provided",
          403: "Insufficient access",
          426: "This build is below the supported floor; the client must update.",
          500: "Internal server error",
        },
      },
    })
    .input(z.void())
    .output(z.array(productDto))
    .query(({ ctx }) => ctx.services.productService.list(ctx.auth.orgId)),

  /**
   * What each product last cost to buy, and what to charge for it. Keyed by
   * productId for the caller to join against `list`; products never purchased
   * are absent rather than present with nulls.
   *
   * Deliberately not folded into `list`: `productDto` is pinned to the platform
   * `Product` type, which has no cost on it on purpose.
   */
  pricing: orgProtectedProcedure
    .input(z.void())
    .query(({ ctx }) => ctx.services.pricingService.list(ctx.auth.orgId)),

  // External catalog text search — returns ranked matches with barcodes.
  searchCatalog: orgProtectedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ ctx, input }) =>
      ctx.services.productDataService.search(input.query),
    ),

  // External catalog lookup for the UPC field — returns name/brand/image.
  lookupUpc: orgProtectedProcedure
    .input(z.object({ upc: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.productDataService.lookup(input.upc),
    ),

  get: orgProtectedProcedure
    .input(z.object({ id: objectId() }))
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
    .input(productInput.extend({ id: objectId() }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.productService.update(ctx.auth.orgId, id, data);
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: objectId() }))
    .mutation(({ ctx, input }) =>
      ctx.services.productService.remove(ctx.auth.orgId, input.id),
    ),
});
