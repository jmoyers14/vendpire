import type { BarcodeResolution } from "../../services/BarcodeResolverService/BarcodeResolverService.ts";
import type { Location } from "../../services/LocationService/LocationService.ts";
import type { Machine } from "../../services/MachineService/MachineService.ts";
import type { Product } from "../../services/ProductService/ProductService.ts";
import type {
  Purchase,
  PurchaseListPage,
} from "../../services/PurchaseService/PurchaseService.ts";
import type {
  ExpiringReport,
  Visit,
} from "../../services/VisitService/VisitService.ts";
import type { MachinePnl } from "../../services/PnlService/PnlService.ts";
import type { AgentServices } from "./AgentTool.ts";

/** Anything a tool must never reach. Calling one is a test failure, loudly. */
const unused = (name: string) => (): never => {
  throw new Error(`${name} is not available to agent read tools`);
};

export interface AgentWorld {
  machines: Machine[];
  locations: Location[];
  products: Product[];
  visits: Visit[];
  latestVisits: Visit[];
  purchases: Purchase[];
  pnl: MachinePnl | null;
  expiring: ExpiringReport | null;
  barcode: BarcodeResolution | null;
}

/**
 * Service-level stubs, not repository fakes: a read tool's job is choosing what
 * to ask for and how to narrate the answer, so a test that controls the service
 * return exercises exactly that and nothing else.
 */
export const buildTestAgentServices = (
  world: Partial<AgentWorld> = {},
): AgentServices => {
  const machines = world.machines ?? [];
  const visits = world.visits ?? [];

  return {
    machineService: {
      list: async () => machines,
      get: async (_orgId, id) => machines.find((each) => each.id === id) ?? null,
      getByTagCode: async (_orgId, tagCode) =>
        machines.find((each) => each.tagCode === tagCode) ?? null,
      create: unused("machineService.create"),
      update: unused("machineService.update"),
      remove: unused("machineService.remove"),
    },
    locationService: {
      list: async () => world.locations ?? [],
      get: async (_orgId, id) =>
        (world.locations ?? []).find((each) => each.id === id) ?? null,
      create: unused("locationService.create"),
      update: unused("locationService.update"),
      remove: unused("locationService.remove"),
    },
    productService: {
      list: async () => world.products ?? [],
      get: async (_orgId, id) =>
        (world.products ?? []).find((each) => each.id === id) ?? null,
      create: unused("productService.create"),
      update: unused("productService.update"),
      remove: unused("productService.remove"),
      attachBarcode: unused("productService.attachBarcode"),
    },
    purchaseService: {
      list: async (): Promise<PurchaseListPage> => ({
        items: world.purchases ?? [],
        nextCursor: null,
      }),
      get: async (_orgId, id) =>
        (world.purchases ?? []).find((each) => each.id === id) ?? null,
      create: unused("purchaseService.create"),
      update: unused("purchaseService.update"),
      remove: unused("purchaseService.remove"),
    },
    visitService: {
      list: async (_orgId, filter) => {
        const matching =
          filter.machineId === undefined || filter.machineId === null
            ? visits
            : visits.filter((visit) => visit.machineId === filter.machineId);
        return matching.slice(0, filter.limit ?? matching.length);
      },
      listLatestByOrg: async () => world.latestVisits ?? [],
      get: async (_orgId, id) => visits.find((each) => each.id === id) ?? null,
      create: unused("visitService.create"),
      remove: unused("visitService.remove"),
      expiringSoon: async (): Promise<ExpiringReport> => {
        if (world.expiring === null || world.expiring === undefined) {
          throw new Error("this test did not stub an expiry report");
        }
        return world.expiring;
      },
    },
    pnlService: {
      byMachine: async (): Promise<MachinePnl> => {
        if (world.pnl === null || world.pnl === undefined) {
          throw new Error("this test did not stub a P&L");
        }
        return world.pnl;
      },
      sheet: unused("pnlService.sheet"),
    },
    barcodeResolverService: {
      resolve: async (): Promise<BarcodeResolution> => {
        if (world.barcode === null || world.barcode === undefined) {
          throw new Error("this test did not stub a barcode resolution");
        }
        return world.barcode;
      },
    },
  };
};

export const testMachine = (over: Partial<Machine> = {}): Machine => ({
  id: "machine_1",
  locationId: "location_1",
  name: "Lobby Snack",
  kind: "snack",
  make: null,
  model: null,
  serial: null,
  tagCode: null,
  templateId: null,
  slots: [["A1", "A2"]],
  cardReader: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

export const testProduct = (over: Partial<Product> = {}): Product => ({
  id: "product_1",
  name: "Doritos Nacho",
  upc: null,
  category: "chips",
  taxClass: null,
  imageUrl: null,
  defaultPriceCents: 150,
  active: true,
  tracksExpiration: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

export const testLocation = (over: Partial<Location> = {}): Location => ({
  id: "location_1",
  name: "Front Office",
  address: { line1: null, city: null, state: null, zip: null, geo: null },
  contact: { name: null, phone: null, email: null },
  commission: { type: "none" },
  notes: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
