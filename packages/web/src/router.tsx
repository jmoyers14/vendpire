import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./screens/RootLayout.tsx";
import { DashboardScreen } from "./screens/DashboardScreen.tsx";

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardScreen,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

// Register the router instance so Link/useNavigate get fully typed paths.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
