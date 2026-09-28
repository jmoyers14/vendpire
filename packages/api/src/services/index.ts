import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container as rootContainer, instanceCachingFactory } from "tsyringe";
import { registerServerCore } from "@vendpire/platform/server";
import {
  SERVER_CONFIG_TOKEN,
  loadServerConfig,
} from "../config/serverConfig.ts";
import {
  AUTH_SERVICE_TOKEN,
  ADDRESS_SERVICE_TOKEN,
  LOCATION_SERVICE_TOKEN,
  MACHINE_SERVICE_TOKEN,
  PRODUCT_SERVICE_TOKEN,
  PRODUCT_DATA_SERVICE_TOKEN,
  PLANOGRAM_SERVICE_TOKEN,
  PURCHASE_SERVICE_TOKEN,
  PACK_SERVICE_TOKEN,
} from "./tokens.ts";
import { AuthServiceImpl } from "./AuthService/AuthServiceImpl.ts";
import { AddressServiceImpl } from "./AddressService/AddressServiceImpl.ts";
import { LocationServiceImpl } from "./LocationService/LocationServiceImpl.ts";
import { MachineServiceImpl } from "./MachineService/MachineServiceImpl.ts";
import { ProductServiceImpl } from "./ProductService/ProductServiceImpl.ts";
import { ProductDataServiceImpl } from "./ProductDataService/ProductDataServiceImpl.ts";
import { PlanogramServiceImpl } from "./PlanogramService/PlanogramServiceImpl.ts";
import { PurchaseServiceImpl } from "./PurchaseService/PurchaseServiceImpl.ts";
import { PackServiceImpl } from "./PackService/PackServiceImpl.ts";

// This entrypoint's composition root. Registrations go on a *child* container
// rather than tsyringe's global one so two entrypoints in the same process (or
// test run) can't see each other's bindings — the API's request-scoped services
// and a future worker's job handlers stay disjoint.
const container = rootContainer.createChildContainer();

// Wire the shared backend (config slices, integration adapters) into the
// container, then register this entrypoint's request-scoped services on top.
// registerSingleton: one shared instance for the process.
registerServerCore(container);

// Server config is this entrypoint's own concern (port + web origin), so it's
// registered here, not in the shared core. Lazy so it's validated only when
// the booting server resolves it.
container.register(SERVER_CONFIG_TOKEN, {
  useFactory: instanceCachingFactory(() => loadServerConfig()),
});

container.registerSingleton(AUTH_SERVICE_TOKEN, AuthServiceImpl);
container.registerSingleton(ADDRESS_SERVICE_TOKEN, AddressServiceImpl);
container.registerSingleton(LOCATION_SERVICE_TOKEN, LocationServiceImpl);
container.registerSingleton(MACHINE_SERVICE_TOKEN, MachineServiceImpl);
container.registerSingleton(PRODUCT_SERVICE_TOKEN, ProductServiceImpl);
container.registerSingleton(PRODUCT_DATA_SERVICE_TOKEN, ProductDataServiceImpl);
container.registerSingleton(PLANOGRAM_SERVICE_TOKEN, PlanogramServiceImpl);
container.registerSingleton(PURCHASE_SERVICE_TOKEN, PurchaseServiceImpl);
container.registerSingleton(PACK_SERVICE_TOKEN, PackServiceImpl);

export { container };
export * from "./tokens.ts";
