import type {
  AnalyticsClient,
  AppConfig,
  AuthIdentity,
  Logger,
} from "@vendpire/platform";
import type { AddressService } from "./services/AddressService/AddressService.ts";
import type { LocationService } from "./services/LocationService/LocationService.ts";
import type { MachineService } from "./services/MachineService/MachineService.ts";
import type { ProductService } from "./services/ProductService/ProductService.ts";
import type { ProductDataService } from "./services/ProductDataService/ProductDataService.ts";
import type { BarcodeResolverService } from "./services/BarcodeResolverService/BarcodeResolverService.ts";
import type { PlanogramService } from "./services/PlanogramService/PlanogramService.ts";
import type { PurchaseService } from "./services/PurchaseService/PurchaseService.ts";
import type { PackService } from "./services/PackService/PackService.ts";

/**
 * Authenticated principal for a request — the provider-neutral identity the
 * AuthClient returns after verifying a session token. `orgId`/`orgRole` are
 * populated only when the user has an active organization; vendpire maps the
 * Clerk organization onto the business, so orgId is the business boundary.
 */
export type AuthContext = AuthIdentity;

/**
 * Request context type. This module imports only service *interfaces* (no DI
 * container, decorators, or runtime globals) so the client can consume the
 * AppRouter type without pulling the server implementation into its compile.
 */
export interface Context {
  auth: AuthContext | null;
  /**
   * Product-analytics sink. Lives beside `services` rather than inside it
   * because capture is a cross-cutting side effect fired at the procedure
   * layer, not domain logic.
   */
  analytics: AnalyticsClient;
  /** Process-wide app identity (environment + build stamp). Read by the system router. */
  appConfig: AppConfig;
  /**
   * Request-scoped logger — the root logger with requestId/orgId/userId already
   * bound, so every line it writes correlates to this request. Typed as the
   * vendor-neutral Logger port, so the web client (which resolves this Context
   * via AppRouter) never sees pino.
   */
  log: Logger;
  services: {
    addressService: AddressService;
    locationService: LocationService;
    machineService: MachineService;
    productService: ProductService;
    productDataService: ProductDataService;
    barcodeResolverService: BarcodeResolverService;
    planogramService: PlanogramService;
    purchaseService: PurchaseService;
    packService: PackService;
  };
}
