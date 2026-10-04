import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container as rootContainer, instanceCachingFactory } from "tsyringe";
import { registerServerCore } from "@vendpire/platform/server";
// Imported from its own entry — NOT the /server barrel — because it statically
// pulls the Cloud Tasks + google-auth SDKs. Keeping it off /server is what stops
// the api (which imports /server) from bundling those and crashing at boot.
import { registerWebhookCore } from "@vendpire/platform/webhook";
import { WORKER_CONFIG_TOKEN, loadWorkerConfig } from "./config/workerConfig.ts";

/**
 * This entrypoint's composition root. Registrations go on a *child* container
 * rather than tsyringe's global one so two entrypoints in the same process (or
 * test run) can't see each other's bindings.
 *
 * The worker resolves both cores:
 *  - registerServerCore — repositories + config the whole app shares.
 *  - registerWebhookCore — the background-job infrastructure only this
 *    entrypoint needs: the task queue (generic — any future job kind reuses it),
 *    the Clerk webhook verifier, and the /tasks/* guard (allow-all locally,
 *    OIDC verification everywhere else). Keeping it off the api is what stops
 *    the api from having to supply a webhook signing secret and GCP queue
 *    settings it never uses.
 *
 * Config slices are lazy caching factories, so booting reads no env — each slice
 * validates the first time it's resolved.
 */
const container = rootContainer.createChildContainer();

registerServerCore(container);
registerWebhookCore(container);

container.register(WORKER_CONFIG_TOKEN, {
  useFactory: instanceCachingFactory(() => loadWorkerConfig()),
});

export { container };
