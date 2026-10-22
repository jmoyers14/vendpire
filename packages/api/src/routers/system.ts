import { z } from "zod";
import { publicProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";
import { clientSupportDto } from "../schemas/index.ts";

export const systemRouter = router({
  /**
   * Public build stamp for this running API instance. Unauthenticated so the
   * web app (and we, when troubleshooting) can read it anywhere, and so a
   * mismatch against the web bundle's own stamp reveals a half-landed deploy.
   */
  version: publicProcedure.query(({ ctx }) => {
    const { version, commit, builtAt, environment } = ctx.appConfig;
    return { version, commit, builtAt, environment };
  }),

  /**
   * Tells an iOS client whether its build is still supported. Must stay a
   * `publicProcedure`: a client old enough to be walled is likely also holding
   * an expired session.
   */
  clientSupport: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/client-support",
        tags: ["system"],
        // The ONLY unauthenticated route on the surface. A client old enough
        // to be walled is likely also holding an expired session, and a wall
        // that needs a valid token is a wall that never appears.
        protect: false,
        operationId: "getClientSupport",
        summary: "Whether this iOS build is still supported",
      },
    })
    .input(
      z.object({
        platform: z.literal("ios"),
        // CFBundleVersion, not the marketing version. Arrives as the STRING
        // "43" in the query string; the generator coerces it from this schema.
        build: z.number().int().min(0),
      }),
    )
    .output(clientSupportDto)
    .query(({ ctx, input }) => {
      const clientSupport = ctx.services.mobileClientSupportService;
      const updateRequirement = clientSupport.verdictFor(input.build);

      if (updateRequirement !== "none") {
        ctx.analytics.capture({
          event: ANALYTICS_EVENTS.STALE_CLIENT_DETECTED,
          // Unauthenticated callers share one bucket: count events, not users.
          distinctId: ctx.auth?.userId ?? "anonymous-ios-client",
          groupId: ctx.auth?.orgId ?? undefined,
          properties: {
            platform: input.platform,
            build: input.build,
            updateRequirement,
          },
        });
      }

      return { updateRequirement, updateUrl: clientSupport.updateUrl };
    }),
});
