import { publicProcedure, router } from "../trpc.ts";

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
});
