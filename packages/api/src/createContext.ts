import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import {
  container,
  AUTH_SERVICE_TOKEN,
  ADDRESS_SERVICE_TOKEN,
  LOCATION_SERVICE_TOKEN,
  MACHINE_SERVICE_TOKEN,
  MACHINE_TEMPLATE_SERVICE_TOKEN,
  PRODUCT_SERVICE_TOKEN,
  PRODUCT_DATA_SERVICE_TOKEN,
  BARCODE_RESOLVER_SERVICE_TOKEN,
  PLANOGRAM_SERVICE_TOKEN,
  PURCHASE_SERVICE_TOKEN,
  VISIT_SERVICE_TOKEN,
  PACK_SERVICE_TOKEN,
  MOBILE_CLIENT_SUPPORT_SERVICE_TOKEN,
} from "./services/index.ts";
import {
  ANALYTICS_CLIENT_TOKEN,
  APP_CONFIG_TOKEN,
  LOGGER_TOKEN,
} from "@vendpire/platform";
import type { AnalyticsClient, AppConfig, Logger } from "@vendpire/platform";
import type { AuthService } from "./services/AuthService/AuthService.ts";
import type { AddressService } from "./services/AddressService/AddressService.ts";
import type { LocationService } from "./services/LocationService/LocationService.ts";
import type { MachineService } from "./services/MachineService/MachineService.ts";
import type { MachineTemplateService } from "./services/MachineTemplateService/MachineTemplateService.ts";
import type { ProductService } from "./services/ProductService/ProductService.ts";
import type { ProductDataService } from "./services/ProductDataService/ProductDataService.ts";
import type { BarcodeResolverService } from "./services/BarcodeResolverService/BarcodeResolverService.ts";
import type { PlanogramService } from "./services/PlanogramService/PlanogramService.ts";
import type { PurchaseService } from "./services/PurchaseService/PurchaseService.ts";
import type { VisitService } from "./services/VisitService/VisitService.ts";
import type { PackService } from "./services/PackService/PackService.ts";
import type { MobileClientSupportService } from "./services/MobileClientSupportService/MobileClientSupportService.ts";
import type { Context } from "./context.ts";

/** Headers exposed Fetch-style, as the REST adapter (trpc-to-openapi) hands us. */
function canGetHeader(
  headers: unknown,
): headers is { get(name: string): string | null } {
  return (
    typeof headers === "object" &&
    headers !== null &&
    typeof (headers as { get?: unknown }).get === "function"
  );
}

/**
 * `CreateHTTPContextOptions` types `req.headers` as a Node `IncomingMessage`'s
 * plain object, but only the standalone tRPC adapter actually hands us that.
 * The REST adapter (trpc-to-openapi) hands us a Fetch API `Request`, whose
 * `headers` is a `Headers` object with no `.authorization` property at all —
 * reading it the Node way silently returns `undefined`. Feature-detect `.get`
 * instead of trusting the declared type.
 */
function authorizationHeaderFrom(headers: unknown): string | undefined {
  if (canGetHeader(headers)) {
    return headers.get("authorization") ?? undefined;
  }
  const value = (headers as { authorization?: unknown } | null)?.authorization;
  return typeof value === "string" ? value : undefined;
}

/**
 * Runs per request. Authenticates the caller via AuthService and resolves the
 * services each procedure needs from the DI container. Lives apart from the
 * Context type so only the server entry imports the container.
 */
export async function createContext(
  opts: CreateHTTPContextOptions,
): Promise<Context> {
  const authService = container.resolve<AuthService>(AUTH_SERVICE_TOKEN);
  const auth = await authService.authenticate(
    authorizationHeaderFrom(opts.req.headers),
  );

  // One correlating id per request, plus the caller's org/user once known, so a
  // request's log lines group together.
  const log = container.resolve<Logger>(LOGGER_TOKEN).child({
    requestId: crypto.randomUUID(),
    orgId: auth?.orgId ?? null,
    userId: auth?.userId ?? null,
  });

  return {
    auth,
    log,
    analytics: container.resolve<AnalyticsClient>(ANALYTICS_CLIENT_TOKEN),
    appConfig: container.resolve<AppConfig>(APP_CONFIG_TOKEN),
    services: {
      addressService: container.resolve<AddressService>(ADDRESS_SERVICE_TOKEN),
      locationService: container.resolve<LocationService>(LOCATION_SERVICE_TOKEN),
      machineService: container.resolve<MachineService>(MACHINE_SERVICE_TOKEN),
      machineTemplateService: container.resolve<MachineTemplateService>(
        MACHINE_TEMPLATE_SERVICE_TOKEN,
      ),
      productService: container.resolve<ProductService>(PRODUCT_SERVICE_TOKEN),
      productDataService: container.resolve<ProductDataService>(
        PRODUCT_DATA_SERVICE_TOKEN,
      ),
      barcodeResolverService: container.resolve<BarcodeResolverService>(
        BARCODE_RESOLVER_SERVICE_TOKEN,
      ),
      planogramService: container.resolve<PlanogramService>(PLANOGRAM_SERVICE_TOKEN),
      purchaseService: container.resolve<PurchaseService>(PURCHASE_SERVICE_TOKEN),
      visitService: container.resolve<VisitService>(VISIT_SERVICE_TOKEN),
      packService: container.resolve<PackService>(PACK_SERVICE_TOKEN),
      mobileClientSupportService: container.resolve<MobileClientSupportService>(
        MOBILE_CLIENT_SUPPORT_SERVICE_TOKEN,
      ),
    },
  };
}
