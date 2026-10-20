import { z } from "zod";
import { publicProcedure, router } from "../trpc.ts";
import { updateRequirementFor } from "../clientSupport/clientSupport.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

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
    .input(
      z.object({
        platform: z.literal("ios"),
        // CFBundleVersion, not the marketing version.
        build: z.number().int().min(0),
      }),
    )
    .query(({ ctx, input }) => {
      const { iosMinimumBuild, iosRecommendedBuild, iosUpdateUrl } = ctx.mobileConfig;
      const updateRequirement = updateRequirementFor({
        build: input.build,
        minimumBuild: iosMinimumBuild,
        recommendedBuild: iosRecommendedBuild,
      });

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

      return { updateRequirement, updateUrl: iosUpdateUrl };
    }),
});
