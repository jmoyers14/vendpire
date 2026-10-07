import { router } from "./trpc.ts";
import { addressRouter } from "./routers/address.ts";
import { barcodesRouter } from "./routers/barcodes.ts";
import { authRouter } from "./routers/auth.ts";
import { systemRouter } from "./routers/system.ts";
import { locationsRouter } from "./routers/locations.ts";
import { machinesRouter } from "./routers/machines.ts";
import { machineTemplatesRouter } from "./routers/machineTemplates.ts";
import { productsRouter } from "./routers/products.ts";
import { planogramsRouter } from "./routers/planograms.ts";
import { purchasesRouter } from "./routers/purchases.ts";
import { visitsRouter } from "./routers/visits.ts";
import { packsRouter } from "./routers/packs.ts";

export const appRouter = router({
  address: addressRouter,
  barcodes: barcodesRouter,
  auth: authRouter,
  system: systemRouter,
  locations: locationsRouter,
  machines: machinesRouter,
  machineTemplates: machineTemplatesRouter,
  products: productsRouter,
  planograms: planogramsRouter,
  purchases: purchasesRouter,
  visits: visitsRouter,
  packs: packsRouter,
});

export type AppRouter = typeof appRouter;
