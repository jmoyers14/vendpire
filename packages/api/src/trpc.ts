import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context.ts";
import { ServiceError } from "./services/errors.ts";

const t = initTRPC.context<Context>().create();

export const router = t.router;

/**
 * Base procedure that maps domain ServiceErrors to tRPC errors. Putting this at
 * the bottom of the chain lets services throw transport-agnostic errors and
 * have them surface with the right status, without importing tRPC themselves.
 */
const baseProcedure = t.procedure.use(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ServiceError) {
      throw new TRPCError({ code: error.code, message: error.message });
    }
    throw error;
  }
});

export const publicProcedure = baseProcedure;

/**
 * Requires a verified Clerk session. Narrows ctx.auth to non-null for
 * downstream resolvers.
 */
export const protectedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.auth) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

/**
 * Requires an active organization — the business boundary. Vendpire treats the
 * Clerk organization as the business, so every business-scoped document keys on
 * this orgId. Narrows orgId to a non-null string so scoped queries can rely on it.
 */
export const orgProtectedProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.auth.orgId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No active organization selected",
    });
  }
  return next({ ctx: { ...ctx, auth: { ...ctx.auth, orgId: ctx.auth.orgId } } });
});
