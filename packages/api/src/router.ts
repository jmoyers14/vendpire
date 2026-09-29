import { router } from "./trpc.ts";
import { addressRouter } from "./routers/address.ts";
import { barcodesRouter } from "./routers/barcodes.ts";
import { authRouter } from "./routers/auth.ts";
import { systemRouter } from "./routers/system.ts";
import { locationsRouter } from "./routers/locations.ts";
import { machinesRouter } from "./routers/machines.ts";
import { productsRouter } from "./routers/products.ts";
import { planogramsRouter } from "./routers/planograms.ts";
import { purchasesRouter } from "./routers/purchases.ts";
import { packsRouter } from "./routers/packs.ts";

export const appRouter = router({
  address: addressRouter,
  barcodes: barcodesRouter,
  auth: authRouter,
  system: systemRouter,
  locations: locationsRouter,
  machines: machinesRouter,
  products: productsRouter,
  planograms: planogramsRouter,
  purchases: purchasesRouter,
  packs: packsRouter,
});

export type AppRouter = typeof appRouter;
