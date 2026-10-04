import "reflect-metadata"; // MUST be imported before any decorated class is used
import { instanceCachingFactory, type DependencyContainer } from "tsyringe";
import { APP_CONFIG_TOKEN, type AppConfig } from "./config/appConfig.ts";
import {
  CLERK_WEBHOOK_CONFIG_TOKEN,
  loadClerkWebhookConfig,
} from "./integrations/webhooks/clerkWebhookConfig.ts";
import { ClerkWebhookVerifier } from "./integrations/webhooks/ClerkWebhookVerifier.ts";
import { AllowAllTaskAuthenticator } from "./integrations/tasks/AllowAllTaskAuthenticator.ts";
import { GoogleOidcTaskAuthenticator } from "./integrations/tasks/GoogleOidcTaskAuthenticator.ts";
import { registerTaskQueue } from "./registerTaskQueue.ts";
import {
  CLERK_WEBHOOK_VERIFIER_TOKEN,
  TASK_AUTHENTICATOR_TOKEN,
} from "./integrations/tokens.ts";

/**
 * Registers the webhook-ingestion collaborators: signature verification, the
 * async job queue, and the guard on the queue's callbacks.
 *
 * Split out from registerServerCore because only the worker needs any of it.
 * The api would otherwise be forced to supply a webhook signing secret and GCP
 * queue settings it never uses — the same all-or-nothing coupling the per-slice
 * config split removed. Keeping it opt-in means each process validates exactly
 * the env it actually reads.
 *
 * Call AFTER registerServerCore: both lazy choices below read AppConfig, which
 * that function registers.
 */
export function registerWebhookCore(container: DependencyContainer): void {
  container.register(CLERK_WEBHOOK_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadClerkWebhookConfig()),
  });
  container.registerSingleton(
    CLERK_WEBHOOK_VERIFIER_TOKEN,
    ClerkWebhookVerifier,
  );

  // Ingestion needs both halves — verify, then enqueue — so the worker gets the
  // queue by calling this. The queue itself isn't webhook-specific, hence its
  // own module.
  registerTaskQueue(container);

  // The /tasks/* guard, chosen the same way and in lockstep with the queue:
  // local's loopback InlineTaskQueue pairs with allow-all (no token exists to
  // check), and every real environment pairs the CloudTasksQueue with OIDC
  // verification. Lazy, so local never has to supply the GCP tasks config the
  // OIDC verifier reads.
  container.register(TASK_AUTHENTICATOR_TOKEN, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      const { environment } =
        dependencyContainer.resolve<AppConfig>(APP_CONFIG_TOKEN);
      return environment === "local"
        ? dependencyContainer.resolve(AllowAllTaskAuthenticator)
        : dependencyContainer.resolve(GoogleOidcTaskAuthenticator);
    }),
  });
}
