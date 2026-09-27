import { router } from "./trpc.ts";
import { authRouter } from "./routers/auth.ts";
import { systemRouter } from "./routers/system.ts";

export const appRouter = router({
  auth: authRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
