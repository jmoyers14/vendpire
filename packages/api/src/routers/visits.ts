import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";
import { DEFAULT_VISIT_LIST_LIMIT } from "../services/VisitService/VisitService.ts";

const visitLineInput = z
  .object({
    slotCode: z.string().min(1).max(8),
    productId: z.string().min(1),
    // What was in the slot on arrival: BEFORE refilling AND before pulling
    // anything out. Nothing downstream can detect a post-fill count, so a
    // violation here makes every derived number silently wrong.
    remaining: z.number().int().min(0).max(999),
    added: z.number().int().min(0).max(999),
    removed: z.number().int().min(0).max(999).default(0),
    removedReason: z
      .enum(["expired", "damaged", "recalled", "destocked", "transferred"])
      .nullable()
      .default(null),
    priceCents: z.number().int().min(0).max(100_000),
    par: z.number().int().min(0).max(999).nullable().default(null),
  })
  // A reason is REQUIRED once units are removed: it decides loss vs. transfer,
  // and defaulting either way would overstate or hide the write-off.
  .refine((line) => line.removed === 0 || line.removedReason !== null, {
    message: "removedReason is required when removed > 0",
  });

const visitInput = z.object({
  machineId: z.string().min(1),
  // A SNAPSHOT from the client, never re-derived here. The phone counted at 9am
  // where the machine then stood; if it moved at 2pm and the outbox submits at
  // 5pm, the server's idea of the machine's location is the wrong answer.
  locationId: z.string().min(1),
  planogramId: z.string().min(1).nullable().default(null),
  // offset:true — zod's default {offset:false} REJECTS "+00:00", which an
  // ISO-8601 formatter may well emit.
  countedAt: z.string().datetime({ offset: true }),
  lines: z.array(visitLineInput).min(1).max(200),
  notes: z.string().max(2000).nullable().default(null),
  // Minted at DRAFT time and stable across retries, so a submit whose response
  // was lost cannot double-post. recordedByUserId is deliberately absent — the
  // server sets it from the verified session.
  clientRequestId: z.string().min(8).max(64),
});

// No cursor: visits are bounded by machines times route frequency, unlike
// purchases. `limit` is a ceiling on one read.
const visitListInput = z.object({
  machineId: z.string().min(1).optional(),
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

  listLatestByOrg: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.visitService.listLatestByOrg(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.visitService.get(ctx.auth.orgId, input.id),
    ),

  pnl: orgProtectedProcedure
    .input(
      z.object({
        machineId: z.string().min(1),
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

  // No `update`. A visit's `remaining` is the baseline the next visit's sold
  // figure is measured against, so editing one silently rewrites the interval
  // after it. Visits are append-only; a mistake is removed and re-counted.
  create: orgProtectedProcedure
    .input(visitInput)
    .mutation(async ({ ctx, input }) => {
      const creation = await ctx.services.visitService.create(ctx.auth.orgId, {
        draft: input,
        recordedByUserId: ctx.auth.userId,
      });

      // A replay wrote nothing, so it is neither logged nor counted: one
      // timed-out submit retried four times would otherwise report itself as
      // four visits and four sets of anomalies.
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
        // Normal for an offline client, and accepted: you service at 9am with no
        // signal and sync at 5pm, after someone else's 2pm visit landed.
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
          // How long the draft sat before it reached the server — the field
          // measure of how well the offline outbox is actually doing.
          latencySeconds: Math.round(
            (Date.parse(creation.visit.createdAt) -
              Date.parse(creation.visit.countedAt)) /
              1000,
          ),
        },
      });

      // The plain Visit on the wire, so the REST surface in Phase 6 returns an
      // entity rather than this service's result envelope.
      return creation.visit;
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.visitService.remove(ctx.auth.orgId, input.id),
    ),
});
