import {
  orgProtectedProcedure,
  protectedProcedure,
  router,
} from "../trpc.ts";

export const authRouter = router({
  // Requires a signed-in user; returns the verified principal.
  me: protectedProcedure.query(({ ctx }) => {
    return {
      userId: ctx.auth.userId,
      orgId: ctx.auth.orgId,
      orgRole: ctx.auth.orgRole,
      orgSlug: ctx.auth.orgSlug,
    };
  }),

  // Requires an active organization (the business); orgId is non-null here.
  organization: orgProtectedProcedure.query(({ ctx }) => {
    return {
      orgId: ctx.auth.orgId,
      orgRole: ctx.auth.orgRole,
      orgSlug: ctx.auth.orgSlug,
    };
  }),
});
