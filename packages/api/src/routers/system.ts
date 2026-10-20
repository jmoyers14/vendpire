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
   * Tells an iOS client whether its build is still supported. Drives the update
   * wall; the `426` gate in the server entry is the backstop for when this
   * answer is missing or stale.
   *
   * **Must stay a `publicProcedure`.** A client old enough to be walled is very
   * likely also holding an expired session, and a wall that needs a valid token
   * to appear is a wall that never appears. The client reports its own build
   * and gets back a verdict — it never learns the floor, which is what lets us
   * raise the floor without shipping an app.
   */
  clientSupport: publicProcedure
    .input(
      z.object({
        platform: z.literal("ios"),
        // CFBundleVersion, the monotonic integer. Never the marketing version.
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
          // Unauthenticated callers collapse into one bucket, so treat the
          // event count — filtered by `build` — as the reliable signal here,
          // not the unique-user count.
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
