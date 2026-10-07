import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";
import { DEFAULT_PURCHASE_PAGE_SIZE } from "../services/PurchaseService/PurchaseService.ts";

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
  // Minted by the client, once per draft, so a double submit can't double-post.
  clientRequestId: z.string().min(8).max(64),
});

// An edit cannot carry a key — see PurchaseEditDraft. Omitting it here means a
// client never has to invent a meaningless one to edit a purchase.
const purchaseEditInput = purchaseInput
  .omit({ clientRequestId: true })
  .extend({ id: z.string().min(1) });

// Cursor pagination over (purchasedAt desc, _id desc) plus an optional date
// window. Two things are load-bearing here:
//   - `cursor` must be a declared key, or tRPC's infiniteQueryOptions helper
//     never appears on the client proxy. `nullish` (not `optional`) is what
//     makes `initialCursor: null` typecheck.
//   - this must stay a NON-strict z.object: the tanstack-react-query adapter
//     injects a `direction` field into every infinite-query request, which a
//     plain object strips and `.strict()` would reject with a 400.
// No maximum on `limit` — the page plus "Load more" is the bound.
const purchaseListInput = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().positive().default(DEFAULT_PURCHASE_PAGE_SIZE),
  cursor: z.string().nullish(),
});

export const purchasesRouter = router({
  list: orgProtectedProcedure
    .input(purchaseListInput)
    .query(({ ctx, input }) =>
      ctx.services.purchaseService.list(ctx.auth.orgId, input),
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
    .input(purchaseEditInput)
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
