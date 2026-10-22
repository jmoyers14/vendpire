import { z } from "zod";
import {
  orgProtectedProcedure,
  protectedProcedure,
  router,
} from "../trpc.ts";
import { identityDto } from "../schemas/index.ts";

export const authRouter = router({
  // Requires a signed-in user; returns the verified principal.
  //
  // protectedProcedure, NOT orgProtectedProcedure — and it must stay that way.
  // A user with no active organization gets `orgId: null` here, which is the
  // only way they can discover why they are stuck. Under an org gate this
  // returns 403 with no way to tell "no org" from "no access".
  me: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/me",
        tags: ["auth"],
        protect: true,
        summary: "The signed-in principal; orgId is null without an active org",
      },
    })
    .input(z.void())
    .output(identityDto)
    .query(({ ctx }) => {
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
