import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";
import {
  DEFAULT_EXPIRY_WINDOW_DAYS,
  DEFAULT_VISIT_LIST_LIMIT,
} from "../services/VisitService/VisitService.ts";
import { visitDto } from "../schemas/index.ts";
import { objectId } from "./validators.ts";

export const visitLineInput = z
  .object({
    slotCode: z.string().min(1).max(8),
    productId: objectId(),
    remaining: z.number().int().min(0).max(999),
    added: z.number().int().min(0).max(999),
    removed: z.number().int().min(0).max(999).default(0),
    removedReason: z
      .enum(["expired", "damaged", "recalled", "destocked", "transferred"])
      .nullable()
      .default(null),
    priceCents: z.number().int().min(0).max(100_000),
    par: z.number().int().min(0).max(999).nullable().default(null),
    bestBy: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
      .nullable()
      .default(null),
  })
  // A reason is REQUIRED once units are removed: it decides loss vs. transfer,
  // and defaulting either way would overstate or hide the write-off.
  .refine((line) => line.removed === 0 || line.removedReason !== null, {
    message: "removedReason is required when removed > 0",
  });

const visitInput = z.object({
  machineId: objectId(),
  // A client snapshot, never re-derived: if the machine moved between the count
  // and the submit, the server's idea of its location is the wrong answer.
  locationId: objectId(),
  planogramId: objectId().nullable().default(null),
  // offset:true — zod's default {offset:false} REJECTS "+00:00", which an
  // ISO-8601 formatter may well emit.
  countedAt: z.string().datetime({ offset: true }),
  lines: z.array(visitLineInput).min(1).max(200),
  notes: z.string().max(2000).nullable().default(null),
  // Minted at DRAFT time and stable across retries, so a submit whose response
  // was lost cannot double-post.
  clientRequestId: z.string().min(8).max(64),
});

// No cursor — visits are bounded by machines times route frequency.
const visitListInput = z.object({
  machineId: objectId().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().positive().default(DEFAULT_VISIT_LIST_LIMIT),
});

export const visitsRouter = router({
  list: orgProtectedProcedure
    .input(visitListInput)
    .query(({ ctx, input }) =>
      ctx.services.visitService.list(ctx.auth.orgId, input),
    ),

  listLatestByOrg: orgProtectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/visits/latest",
        tags: ["visits"],
        protect: true,
        summary: "The latest visit for every machine in the organization",
      },
    })
    .input(z.void())
    .output(z.array(visitDto))
    .query(({ ctx }) => ctx.services.visitService.listLatestByOrg(ctx.auth.orgId)),

  get: orgProtectedProcedure
    .input(z.object({ id: objectId() }))
    .query(({ ctx, input }) =>
      ctx.services.visitService.get(ctx.auth.orgId, input.id),
    ),

  pnl: orgProtectedProcedure
    .input(
      z.object({
        machineId: objectId(),
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.services.visitService.pnl(ctx.auth.orgId, input.machineId, {
        from: input.from ?? null,
        to: input.to ?? null,
      }),
    ),

  expiringSoon: orgProtectedProcedure
    .input(
      z.object({
        withinDays: z
          .number()
          .int()
          .min(0)
          .max(365)
          .default(DEFAULT_EXPIRY_WINDOW_DAYS),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.services.visitService.expiringSoon(ctx.auth.orgId, {
        withinDays: input.withinDays,
      }),
    ),

  // No `update`: a visit's `remaining` is the next visit's baseline, so editing
  // one rewrites the interval after it. Remove and re-count instead.
  create: orgProtectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/visits",
        tags: ["visits"],
        protect: true,
        summary: "Record a servicing of one machine",
        description:
          "Idempotent on clientRequestId: a repeat submit returns the first visit rather than creating another.",
      },
    })
    .input(visitInput)
    .output(visitDto)
    .mutation(async ({ ctx, input }) => {
      const creation = await ctx.services.visitService.create(ctx.auth.orgId, {
        draft: input,
        recordedByUserId: ctx.auth.userId,
      });

      // A replay wrote nothing, so it is neither logged nor counted — one
      // retried submit would otherwise report itself as several visits.
      if (creation.isReplay) {
        return creation.visit;
      }

      if (creation.notices.length > 0 || creation.anomalies.length > 0) {
        ctx.log.warn(
          {
            visitId: creation.visit.id,
            machineId: creation.visit.machineId,
            notices: creation.notices,
            anomalies: creation.anomalies,
          },
          "visit stored with anomalies",
        );
      }
      if (creation.isOutOfOrder) {
        // Normal for an offline client, and accepted.
        ctx.log.info(
          {
            visitId: creation.visit.id,
            machineId: creation.visit.machineId,
            countedAt: creation.visit.countedAt,
          },
          "visit arrived out of order",
        );
      }

      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.VISIT_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: {
          visitId: creation.visit.id,
          machineId: creation.visit.machineId,
          lineCount: creation.visit.lines.length,
          outOfOrder: creation.isOutOfOrder,
          anomalyCount: creation.anomalies.length + creation.notices.length,
          // How long the draft sat in the outbox before it reached the server.
          latencySeconds: Math.round(
            (Date.parse(creation.visit.createdAt) -
              Date.parse(creation.visit.countedAt)) /
              1000,
          ),
        },
      });

      // The plain Visit on the wire, so Phase 6's REST surface returns an
      // entity rather than this service's envelope.
      return creation.visit;
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: objectId() }))
    .mutation(({ ctx, input }) =>
      ctx.services.visitService.remove(ctx.auth.orgId, input.id),
    ),
});
