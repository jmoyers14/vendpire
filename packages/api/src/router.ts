import { router } from "./trpc.ts";
import { addressRouter } from "./routers/address.ts";
import { authRouter } from "./routers/auth.ts";
import { barcodesRouter } from "./routers/barcodes.ts";
import { candidatesRouter } from "./routers/candidates.ts";
import { locationsRouter } from "./routers/locations.ts";
import { machinesRouter } from "./routers/machines.ts";
import { machineTemplatesRouter } from "./routers/machineTemplates.ts";
import { packsRouter } from "./routers/packs.ts";
import { planogramsRouter } from "./routers/planograms.ts";
import { pnlRouter } from "./routers/pnl.ts";
import { productsRouter } from "./routers/products.ts";
import { purchasesRouter } from "./routers/purchases.ts";
import { systemRouter } from "./routers/system.ts";
import { visitsRouter } from "./routers/visits.ts";

export const appRouter = router({
  address: addressRouter,
  auth: authRouter,
  barcodes: barcodesRouter,
  candidates: candidatesRouter,
  locations: locationsRouter,
  machines: machinesRouter,
  machineTemplates: machineTemplatesRouter,
  packs: packsRouter,
  planograms: planogramsRouter,
  pnl: pnlRouter,
  products: productsRouter,
  purchases: purchasesRouter,
  system: systemRouter,
  visits: visitsRouter,
});

export type AppRouter = typeof appRouter;
