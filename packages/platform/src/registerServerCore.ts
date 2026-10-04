import "reflect-metadata"; // MUST be imported before any decorated class is used
import { instanceCachingFactory, type DependencyContainer } from "tsyringe";
import { APP_CONFIG_TOKEN } from "./config/appConfig.ts";
import { loadAppConfig } from "./config/loadAppConfig.ts";
import {
  DATABASE_CONFIG_TOKEN,
  loadDatabaseConfig,
} from "./data-access/databaseConfig.ts";
import {
  CLERK_CONFIG_TOKEN,
  loadClerkConfig,
} from "./integrations/auth/clerkConfig.ts";
import {
  ANALYTICS_CONFIG_TOKEN,
  loadAnalyticsConfig,
} from "./integrations/analytics/analyticsConfig.ts";
import {
  AUTH_CLIENT_TOKEN,
  ANALYTICS_CLIENT_TOKEN,
  MAPS_CLIENT_TOKEN,
  PRODUCT_DATA_CLIENT_TOKEN,
} from "./integrations/tokens.ts";
import {
  MAPS_CONFIG_TOKEN,
  loadMapsConfig,
} from "./integrations/maps/mapsConfig.ts";
import { GoogleMapsClient } from "./integrations/maps/GoogleMapsClient.ts";
import { OpenFoodFactsClient } from "./integrations/productdata/OpenFoodFactsClient.ts";
import { ClerkClient } from "./integrations/auth/ClerkClient.ts";
import { PostHogClient } from "./integrations/analytics/PostHogClient.ts";
import {
  LOCATION_REPOSITORY_TOKEN,
  MACHINE_REPOSITORY_TOKEN,
  MACHINE_TEMPLATE_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
  PLANOGRAM_REPOSITORY_TOKEN,
  PURCHASE_REPOSITORY_TOKEN,
  PACK_REPOSITORY_TOKEN,
  WEBHOOK_EVENT_REPOSITORY_TOKEN,
  JOB_REPOSITORY_TOKEN,
  USER_REPOSITORY_TOKEN,
  ORGANIZATION_REPOSITORY_TOKEN,
  ORGANIZATION_MEMBERSHIP_REPOSITORY_TOKEN,
} from "./data-access/tokens.ts";
import { LocationRepositoryImpl } from "./data-access/repositories/LocationRepository/LocationRepositoryImpl.ts";
import { MachineRepositoryImpl } from "./data-access/repositories/MachineRepository/MachineRepositoryImpl.ts";
import { MachineTemplateRepositoryImpl } from "./data-access/repositories/MachineTemplateRepository/MachineTemplateRepositoryImpl.ts";
import { ProductRepositoryImpl } from "./data-access/repositories/ProductRepository/ProductRepositoryImpl.ts";
import { PlanogramRepositoryImpl } from "./data-access/repositories/PlanogramRepository/PlanogramRepositoryImpl.ts";
import { PurchaseRepositoryImpl } from "./data-access/repositories/PurchaseRepository/PurchaseRepositoryImpl.ts";
import { PackRepositoryImpl } from "./data-access/repositories/PackRepository/PackRepositoryImpl.ts";
import { WebhookEventRepositoryImpl } from "./data-access/repositories/WebhookEventRepository/WebhookEventRepositoryImpl.ts";
import { JobRepositoryImpl } from "./data-access/repositories/JobRepository/JobRepositoryImpl.ts";
import { UserRepositoryImpl } from "./data-access/repositories/UserRepository/UserRepositoryImpl.ts";
import { OrganizationRepositoryImpl } from "./data-access/repositories/OrganizationRepository/OrganizationRepositoryImpl.ts";
import { OrganizationMembershipRepositoryImpl } from "./data-access/repositories/OrganizationMembershipRepository/OrganizationMembershipRepositoryImpl.ts";
import { LOGGER_TOKEN } from "./logging/Logger.ts";
import { rootLogger } from "./logging/pinoLogger.ts";

/**
 * Wires the shared backend (config slices, repositories, integration
 * adapters) into a DI container. Called explicitly by
 * each entrypoint's composition root rather than relying on import-time side
 * effects, so a process only registers what it asks for.
 *
 * Config slices are registered as lazy caching factories: a slice's env is read
 * and validated the first time something resolves it, not at registration. So
 * an entrypoint that never resolves, say, the analytics client never validates
 * the analytics env — each process only pays for the config it actually uses.
 */
export function registerServerCore(container: DependencyContainer): void {
  // The root logger is a ready-made value (no env to validate), so registered
  // as-is rather than via a factory. Services/adapters inject LOGGER_TOKEN;
  // entrypoints and request scopes derive children from it.
  container.register(LOGGER_TOKEN, { useValue: rootLogger });

  container.register(APP_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadAppConfig()),
  });
  container.register(DATABASE_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadDatabaseConfig()),
  });
  container.register(CLERK_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadClerkConfig()),
  });
  container.register(ANALYTICS_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadAnalyticsConfig()),
  });
  container.register(MAPS_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadMapsConfig()),
  });

  container.registerSingleton(LOCATION_REPOSITORY_TOKEN, LocationRepositoryImpl);
  container.registerSingleton(MACHINE_REPOSITORY_TOKEN, MachineRepositoryImpl);
  container.registerSingleton(
    MACHINE_TEMPLATE_REPOSITORY_TOKEN,
    MachineTemplateRepositoryImpl,
  );
  container.registerSingleton(PRODUCT_REPOSITORY_TOKEN, ProductRepositoryImpl);
  container.registerSingleton(PLANOGRAM_REPOSITORY_TOKEN, PlanogramRepositoryImpl);
  container.registerSingleton(PURCHASE_REPOSITORY_TOKEN, PurchaseRepositoryImpl);
  container.registerSingleton(PACK_REPOSITORY_TOKEN, PackRepositoryImpl);

  // Webhook-fed infrastructure and identity mirrors. On registerServerCore
  // rather than registerWebhookCore because these are ordinary repositories —
  // any process may read them. Only the *writers* (verifier, queue) are
  // worker-only.
  container.registerSingleton(
    WEBHOOK_EVENT_REPOSITORY_TOKEN,
    WebhookEventRepositoryImpl,
  );
  container.registerSingleton(JOB_REPOSITORY_TOKEN, JobRepositoryImpl);
  container.registerSingleton(USER_REPOSITORY_TOKEN, UserRepositoryImpl);
  container.registerSingleton(
    ORGANIZATION_REPOSITORY_TOKEN,
    OrganizationRepositoryImpl,
  );
  container.registerSingleton(
    ORGANIZATION_MEMBERSHIP_REPOSITORY_TOKEN,
    OrganizationMembershipRepositoryImpl,
  );

  container.registerSingleton(AUTH_CLIENT_TOKEN, ClerkClient);
  container.registerSingleton(ANALYTICS_CLIENT_TOKEN, PostHogClient);
  container.registerSingleton(MAPS_CLIENT_TOKEN, GoogleMapsClient);
  container.registerSingleton(PRODUCT_DATA_CLIENT_TOKEN, OpenFoodFactsClient);
}
