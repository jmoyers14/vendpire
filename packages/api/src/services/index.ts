import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container as rootContainer, instanceCachingFactory } from "tsyringe";
import { registerServerCore } from "@vendpire/platform/server";
import {
  SERVER_CONFIG_TOKEN,
  loadServerConfig,
} from "../config/serverConfig.ts";
import { AUTH_SERVICE_TOKEN } from "./tokens.ts";
import { AuthServiceImpl } from "./AuthService/AuthServiceImpl.ts";

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

export { container };
export * from "./tokens.ts";
