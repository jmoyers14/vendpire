import { describe, expect, it } from "bun:test";
import type { PnlTotals, SlotInterval } from "@vendpire/domain";
import type { AgentIdentity } from "../../services/AuthService/AuthService.ts";
import type { Visit } from "../../services/VisitService/VisitService.ts";
import type { MachinePnl } from "../../services/PnlService/PnlService.ts";
import { AgentToolError, type AgentServices } from "./AgentTool.ts";
import { formatMoney, formatMoneyOrUnknown } from "./format.ts";
import { buildAgentScope } from "./index.ts";
import { expiringStock } from "./expiringStock.ts";
import { findProduct } from "./findProduct.ts";
import { listMachines } from "./listMachines.ts";
import { lookupBarcode } from "./lookupBarcode.ts";
import { machinePnl } from "./machinePnl.ts";
import {
  buildTestAgentServices,
  testLocation,
  testMachine,
  testProduct,
} from "./testAgentServices.ts";

const identity = (
  memberships: AgentIdentity["memberships"] = [
    { orgId: "org_1", orgName: "Moyers Vending", orgSlug: null, orgRole: "org:admin" },
  ],
): AgentIdentity => ({
  userId: "user_1",
  clientId: "client_1",
  scopes: ["profile"],
  audiences: ["https://api.vendpire.test/mcp"],
  orgId: null,
  memberships,
});

const scopeFor = (services: AgentServices, input: unknown = {}) =>
  buildAgentScope(identity(), services, input);

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: "visit_1",
  machineId: "machine_1",
  locationId: "location_1",
  planogramId: null,
  countedAt: "2026-11-02T17:30:00.000Z",
  recordedByUserId: "user_1",
  lines: [],
  notes: null,
  clientRequestId: "req_1",
  createdAt: "2026-11-02T17:30:00.000Z",
  updatedAt: "2026-11-02T17:30:00.000Z",
  ...over,
});

const interval = (over: Partial<SlotInterval> = {}): SlotInterval => ({
  slotCode: "A1",
  productId: "product_1",
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-11-01T00:00:00.000Z",
  sold: { status: "known", units: 10 },
  priceCents: 150,
  parAtFill: 10,
  ...over,
});

const totals = (over: Partial<PnlTotals> = {}): PnlTotals => ({
  revenueCents: 1500,
  cogsCents: 600,
  grossProfitCents: 900,
  writeOffCents: 0,
  writeOffUnits: 0,
  returnedToStockUnits: 0,
  netProfitCents: 900,
  unknownSoldRows: 0,
  unknownCostRows: 0,
  unknownRemovalReasonRows: 0,
  ...over,
});

const pnlOf = (over: Partial<MachinePnl> = {}): MachinePnl => ({
  machineId: "machine_1",
  from: null,
  to: null,
  rows: { intervals: [{ interval: interval(), revenueCents: 1500, cogsCents: 600 }], removals: [] },
  totals: totals(),
  anomalies: [],
  ...over,
});

describe("formatMoney", () => {
  it("puts the sign outside the dollar sign", () => {
    expect(formatMoney(-321)).toBe("-$3.21");
  });

  it("pads cents below ten", () => {
    expect(formatMoney(1505)).toBe("$15.05");
  });

  // The whole reason this helper exists.
  it("never renders an unknown as a zero", () => {
    expect(formatMoneyOrUnknown(null)).toBe("unknown");
    expect(formatMoneyOrUnknown(0)).toBe("$0.00");
  });
});

describe("business resolution", () => {
  it("picks the only business without being told", () => {
    const scope = scopeFor(buildTestAgentServices());

    expect(scope.orgId).toBe("org_1");
  });

  // Reading another business's numbers is worse than refusing to read any.
  it("refuses to guess when the account has several businesses", () => {
    const several = identity([
      { orgId: "org_1", orgName: "Moyers Vending", orgSlug: null, orgRole: "org:admin" },
      { orgId: "org_2", orgName: "Second Route", orgSlug: null, orgRole: "org:member" },
    ]);

    expect(() => buildAgentScope(several, buildTestAgentServices(), {})).toThrow(
      AgentToolError,
    );
  });

  it("names the choices so the model can ask a real question", () => {
    const several = identity([
      { orgId: "org_1", orgName: "Moyers Vending", orgSlug: null, orgRole: "org:admin" },
      { orgId: "org_2", orgName: "Second Route", orgSlug: null, orgRole: "org:member" },
    ]);

    try {
      buildAgentScope(several, buildTestAgentServices(), {});
      throw new Error("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentToolError);
      expect((error as AgentToolError).data.businesses).toEqual([
        { id: "org_1", name: "Moyers Vending" },
        { id: "org_2", name: "Second Route" },
      ]);
    }
  });

  it("resolves a named business case-insensitively", () => {
    const several = identity([
      { orgId: "org_1", orgName: "Moyers Vending", orgSlug: null, orgRole: "org:admin" },
      { orgId: "org_2", orgName: "Second Route", orgSlug: null, orgRole: "org:member" },
    ]);

    const scope = buildAgentScope(several, buildTestAgentServices(), {
      business: "second route",
    });

    expect(scope.orgId).toBe("org_2");
  });
});

describe("list_machines", () => {
  it("reports when each machine was last serviced", async () => {
    const services = buildTestAgentServices({
      machines: [testMachine()],
      locations: [testLocation()],
      latestVisits: [visit()],
    });

    const output = await listMachines.execute({}, scopeFor(services));

    expect(output.text).toContain("Lobby Snack");
    expect(output.text).toContain("Front Office");
    expect(output.text).toContain("last visit 2026-11-02");
  });

  it("says plainly when a machine has never been visited", async () => {
    const services = buildTestAgentServices({
      machines: [testMachine()],
      locations: [testLocation()],
      latestVisits: [],
    });

    const output = await listMachines.execute({}, scopeFor(services));

    expect(output.text).toContain("never visited");
  });

  it("hides retired machines unless asked", async () => {
    const services = buildTestAgentServices({
      machines: [testMachine(), testMachine({ id: "machine_2", name: "Old Combo", active: false })],
      locations: [testLocation()],
      latestVisits: [],
    });

    const quiet = await listMachines.execute({}, scopeFor(services));
    const loud = await listMachines.execute({ includeInactive: true }, scopeFor(services));

    expect(quiet.text).not.toContain("Old Combo");
    expect(loud.text).toContain("Old Combo");
  });
});

describe("machine_pnl", () => {
  it("narrates an unknown COGS as unknown, never as zero", async () => {
    const services = buildTestAgentServices({
      machines: [testMachine()],
      products: [testProduct()],
      pnl: pnlOf({
        rows: {
          intervals: [{ interval: interval(), revenueCents: 1500, cogsCents: null }],
          removals: [],
        },
        totals: totals({
          cogsCents: null,
          grossProfitCents: null,
          netProfitCents: null,
          unknownCostRows: 1,
        }),
      }),
    });

    const output = await machinePnl.execute(
      { machine: "Lobby Snack" },
      scopeFor(services),
    );

    expect(output.text).toContain("COGS:         unknown");
    expect(output.text).toContain("Gross profit: unknown");
    expect(output.text).toContain("COGS is unknown, not zero");
    // A real zero (no write-offs) is still allowed to print as $0.00 — what
    // must never happen is an unknown rendering that way.
    expect(output.text).not.toContain("COGS:         $0.00");
    expect(output.text).toContain("unknown cost");
  });

  it("says revenue is a floor when intervals have no sold figure", async () => {
    const services = buildTestAgentServices({
      machines: [testMachine()],
      products: [testProduct()],
      pnl: pnlOf({ totals: totals({ unknownSoldRows: 2 }) }),
    });

    const output = await machinePnl.execute(
      { machine: "Lobby Snack" },
      scopeFor(services),
    );

    expect(output.text).toContain("a floor, not a total");
  });

  // par is a placeholder 10 everywhere, so every full slot trips over-par.
  it("drops over-par anomalies and keeps the real ones", async () => {
    const services = buildTestAgentServices({
      machines: [testMachine()],
      products: [testProduct()],
      pnl: pnlOf({
        anomalies: [
          { kind: "over-par", slotCode: "A1", productId: "product_1", level: 12, par: 10 },
          { kind: "over-removed", slotCode: "A2", productId: "product_1", remaining: 2, removed: 5 },
        ],
      }),
    });

    const output = await machinePnl.execute(
      { machine: "Lobby Snack" },
      scopeFor(services),
    );

    expect(output.text).not.toContain("over-par");
    expect(output.text).toContain("more pulled out than was in it");
  });

  it("names products rather than ids in the breakdown", async () => {
    const services = buildTestAgentServices({
      machines: [testMachine()],
      products: [testProduct()],
      pnl: pnlOf(),
    });

    const output = await machinePnl.execute(
      { machine: "Lobby Snack" },
      scopeFor(services),
    );

    expect(output.text).toContain("Doritos Nacho: 10 units");
    expect(output.text).not.toContain("product_1");
  });
});

describe("machine resolution", () => {
  it("refuses an ambiguous name and offers the candidates", async () => {
    const services = buildTestAgentServices({
      machines: [
        testMachine({ id: "machine_1", name: "Lobby Snack A" }),
        testMachine({ id: "machine_2", name: "Lobby Snack B" }),
      ],
      products: [],
      pnl: pnlOf(),
    });

    const call = machinePnl.execute({ machine: "Lobby" }, scopeFor(services));

    await expect(call).rejects.toThrow(/matches 2 machines/);
  });

  it("prefers an exact name over a substring of another", async () => {
    const services = buildTestAgentServices({
      machines: [
        testMachine({ id: "machine_1", name: "Lobby" }),
        testMachine({ id: "machine_2", name: "Lobby Annex" }),
      ],
      products: [testProduct()],
      pnl: pnlOf(),
    });

    const output = await machinePnl.execute({ machine: "Lobby" }, scopeFor(services));

    expect(output.text).toContain("Lobby, all time");
  });

  it("resolves by tag code", async () => {
    const services = buildTestAgentServices({
      machines: [testMachine({ tagCode: "VND-7" })],
      products: [testProduct()],
      pnl: pnlOf(),
    });

    const output = await machinePnl.execute({ machine: "VND-7" }, scopeFor(services));

    expect(output.text).toContain("Lobby Snack");
  });
});

describe("find_product", () => {
  it("matches on name, category, and barcode", async () => {
    const services = buildTestAgentServices({
      products: [
        testProduct({ id: "product_1", name: "Doritos Nacho", upc: "0028400001", category: "chips" }),
        testProduct({ id: "product_2", name: "Coke Zero", category: "drinks" }),
      ],
    });

    const byName = await findProduct.execute({ query: "doritos" }, scopeFor(services));
    const byCategory = await findProduct.execute({ query: "drinks" }, scopeFor(services));
    const byUpc = await findProduct.execute({ query: "0028400001" }, scopeFor(services));

    expect(byName.text).toContain("Doritos Nacho");
    expect(byName.text).not.toContain("Coke Zero");
    expect(byCategory.text).toContain("Coke Zero");
    expect(byUpc.text).toContain("Doritos Nacho");
  });

  it("calls the catalog price a suggestion, since slots carry the real one", () => {
    expect(findProduct.description).toContain("set per slot");
  });
});

describe("lookup_barcode", () => {
  it("reports a known product with its id", async () => {
    const product = testProduct();
    const services = buildTestAgentServices({
      barcode: { status: "product", gtin14: "00028400001", product },
    });

    const output = await lookupBarcode.execute({ barcode: "28400001" }, scopeFor(services));

    expect(output.text).toContain("Doritos Nacho");
    expect(output.data.status).toBe("product");
  });

  it("does not let a catalog candidate read as a product we stock", async () => {
    const services = buildTestAgentServices({
      barcode: {
        status: "candidate",
        gtin14: "00028400002",
        likelyCase: true,
        item: { name: "Nacho Cheese", brand: "Doritos", imageUrl: null },
      },
    });

    const output = await lookupBarcode.execute({ barcode: "28400002" }, scopeFor(services));

    expect(output.text).toContain("not in Moyers Vending's catalog yet");
    expect(output.text).toContain("Nothing has been created");
    expect(output.text).toContain("case barcode");
  });

  it("says a bad barcode is bad rather than unknown", async () => {
    const services = buildTestAgentServices({
      barcode: { status: "invalid", raw: "12345" },
    });

    const output = await lookupBarcode.execute({ barcode: "12345" }, scopeFor(services));

    expect(output.text).toContain("not a valid barcode");
  });
});

describe("expiring_stock", () => {
  // An empty expired list means nothing if nobody recorded dates.
  it("surfaces slots with no best-by recorded", async () => {
    const services = buildTestAgentServices({
      expiring: {
        asOf: "2026-11-12" as never,
        withinDays: 14,
        expired: [],
        expiringSoon: [],
        missingDates: [
          {
            machineId: "machine_1",
            machineName: "Lobby Snack",
            locationId: "location_1",
            locationName: "Front Office",
            slotCode: "A1",
            productId: "product_1",
            productName: "Doritos Nacho",
            units: 6,
            bestBy: null,
            daysUntil: null,
          },
        ],
      },
    });

    const output = await expiringStock.execute({}, scopeFor(services));

    expect(output.text).toContain("No best-by recorded");
    expect(output.text).toContain("Doritos Nacho");
  });

  it("confirms both conditions when there is genuinely nothing to do", async () => {
    const services = buildTestAgentServices({
      expiring: {
        asOf: "2026-11-12" as never,
        withinDays: 14,
        expired: [],
        expiringSoon: [],
        missingDates: [],
      },
    });

    const output = await expiringStock.execute({}, scopeFor(services));

    expect(output.text).toContain("nothing in Moyers Vending is expired");
    expect(output.text).toContain("every expiration-tracked slot has a date on file");
  });
});
