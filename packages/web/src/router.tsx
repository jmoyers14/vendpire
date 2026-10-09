import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { DashboardScreen } from "./screens/dashboard/DashboardScreen.tsx";
import { DesignSystemScreen } from "./screens/design-system/DesignSystemScreen.tsx";
import { LocationFormScreen } from "./screens/locations/LocationFormScreen.tsx";
import { LocationsScreen } from "./screens/locations/LocationsScreen.tsx";
import { MachineFormScreen } from "./screens/machines/MachineFormScreen.tsx";
import { MachinePlanogramsScreen } from "./screens/machines/MachinePlanogramsScreen.tsx";
import { MachineTemplatesScreen } from "./screens/machines/MachineTemplatesScreen.tsx";
import { MachineTemplateFormScreen } from "./screens/machines/MachineTemplateFormScreen.tsx";
import { MachinesScreen } from "./screens/machines/MachinesScreen.tsx";
import { PackFormScreen } from "./screens/packs/PackFormScreen.tsx";
import { PacksScreen } from "./screens/packs/PacksScreen.tsx";
import { ProductFormScreen } from "./screens/products/ProductFormScreen.tsx";
import { ProductsScreen } from "./screens/products/ProductsScreen.tsx";
import { PurchaseFormScreen } from "./screens/purchases/PurchaseFormScreen.tsx";
import { PurchasesScreen } from "./screens/purchases/PurchasesScreen.tsx";
import { RootLayout } from "./screens/root-layout/RootLayout.tsx";
import { MachineVisitsScreen } from "./screens/visits/MachineVisitsScreen.tsx";
import { VisitEntryScreen } from "./screens/visits/VisitEntryScreen.tsx";

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardScreen,
});

// Unlinked reference page for the design system primitives.
const designRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/design",
  component: DesignSystemScreen,
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

// Static "templates" outranks the $machineId routes below — the matcher scores
// static segments above dynamic ones, so declaration order doesn't matter.
const machineTemplatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/machines/templates",
  component: MachineTemplatesScreen,
});

const newMachineTemplateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/machines/templates/new",
  component: MachineTemplateFormScreen,
});

const editMachineTemplateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/machines/templates/$templateId/edit",
  component: function EditMachineTemplate() {
    const { templateId } = editMachineTemplateRoute.useParams();
    return <MachineTemplateFormScreen templateId={templateId} />;
  },
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

const machineVisitsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/machines/$machineId/visits",
  component: function MachineVisits() {
    const { machineId } = machineVisitsRoute.useParams();
    return <MachineVisitsScreen machineId={machineId} />;
  },
});

// Static "new" outscores nothing here — its parent segment is already dynamic —
// so this sits beside the list route rather than under it.
const newVisitRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/machines/$machineId/visits/new",
  component: function NewVisit() {
    const { machineId } = newVisitRoute.useParams();
    return <VisitEntryScreen machineId={machineId} />;
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

const packsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/packs",
  component: PacksScreen,
});

const newPackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/packs/new",
  component: PackFormScreen,
});

const editPackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/packs/$packId/edit",
  component: function EditPack() {
    const { packId } = editPackRoute.useParams();
    return <PackFormScreen packId={packId} />;
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
  designRoute,
  locationsRoute,
  newLocationRoute,
  editLocationRoute,
  machinesRoute,
  newMachineRoute,
  machineTemplatesRoute,
  newMachineTemplateRoute,
  editMachineTemplateRoute,
  editMachineRoute,
  machinePlanogramsRoute,
  machineVisitsRoute,
  newVisitRoute,
  productsRoute,
  newProductRoute,
  editProductRoute,
  packsRoute,
  newPackRoute,
  editPackRoute,
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
