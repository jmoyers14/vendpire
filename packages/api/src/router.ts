import { router } from "./trpc.ts";
import { authRouter } from "./routers/auth.ts";
import { systemRouter } from "./routers/system.ts";
import { locationsRouter } from "./routers/locations.ts";
import { machinesRouter } from "./routers/machines.ts";
import { productsRouter } from "./routers/products.ts";
import { planogramsRouter } from "./routers/planograms.ts";
import { purchasesRouter } from "./routers/purchases.ts";

export const appRouter = router({
  auth: authRouter,
  system: systemRouter,
  locations: locationsRouter,
  machines: machinesRouter,
  products: productsRouter,
  planograms: planogramsRouter,
  purchases: purchasesRouter,
});

export type AppRouter = typeof appRouter;
