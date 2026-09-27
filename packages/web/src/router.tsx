import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./screens/RootLayout.tsx";
import { DashboardScreen } from "./screens/DashboardScreen.tsx";
import { LocationsScreen } from "./screens/LocationsScreen.tsx";
import { LocationFormScreen } from "./screens/LocationFormScreen.tsx";
import { MachinesScreen } from "./screens/MachinesScreen.tsx";
import { MachineFormScreen } from "./screens/MachineFormScreen.tsx";
import { MachinePlanogramsScreen } from "./screens/MachinePlanogramsScreen.tsx";
import { ProductsScreen } from "./screens/ProductsScreen.tsx";
import { ProductFormScreen } from "./screens/ProductFormScreen.tsx";
import { PurchasesScreen } from "./screens/PurchasesScreen.tsx";
import { PurchaseFormScreen } from "./screens/PurchaseFormScreen.tsx";

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardScreen,
});

const locationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/locations",
  component: LocationsScreen,
});

const newLocationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/locations/new",
  component: LocationFormScreen,
});

const editLocationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/locations/$locationId/edit",
  component: function EditLocation() {
    const { locationId } = editLocationRoute.useParams();
    return <LocationFormScreen locationId={locationId} />;
  },
});

const machinesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/machines",
  component: MachinesScreen,
});

const newMachineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/machines/new",
  component: MachineFormScreen,
});

const editMachineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/machines/$machineId/edit",
  component: function EditMachine() {
    const { machineId } = editMachineRoute.useParams();
    return <MachineFormScreen machineId={machineId} />;
  },
});

const machinePlanogramsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/machines/$machineId/planograms",
  component: function MachinePlanograms() {
    const { machineId } = machinePlanogramsRoute.useParams();
    return <MachinePlanogramsScreen machineId={machineId} />;
  },
});

const productsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products",
  component: ProductsScreen,
});

const newProductRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products/new",
  component: ProductFormScreen,
});

const editProductRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products/$productId/edit",
  component: function EditProduct() {
    const { productId } = editProductRoute.useParams();
    return <ProductFormScreen productId={productId} />;
  },
});

const purchasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/purchases",
  component: PurchasesScreen,
});

const newPurchaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/purchases/new",
  component: PurchaseFormScreen,
});

const editPurchaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/purchases/$purchaseId/edit",
  component: function EditPurchase() {
    const { purchaseId } = editPurchaseRoute.useParams();
    return <PurchaseFormScreen purchaseId={purchaseId} />;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  locationsRoute,
  newLocationRoute,
  editLocationRoute,
  machinesRoute,
  newMachineRoute,
  editMachineRoute,
  machinePlanogramsRoute,
  productsRoute,
  newProductRoute,
  editProductRoute,
  purchasesRoute,
  newPurchaseRoute,
  editPurchaseRoute,
]);

export const router = createRouter({ routeTree });

// Register the router instance so Link/useNavigate get fully typed paths.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
