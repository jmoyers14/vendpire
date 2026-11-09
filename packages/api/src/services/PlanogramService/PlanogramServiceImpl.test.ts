import { beforeEach, describe, expect, it } from "bun:test";
import { PlanogramServiceImpl } from "./PlanogramServiceImpl.ts";
import {
  FakeLocationRepository,
  FakeMachineRepository,
  FakePlanogramRepository,
  FakeProductRepository,
  locationInput,
  machineInput,
  productInput,
} from "../test-support/fakes.ts";

const ORG = "org_1";

describe("PlanogramService", () => {
  let machines: FakeMachineRepository;
  let products: FakeProductRepository;
  let planograms: FakePlanogramRepository;
  let service: PlanogramServiceImpl;
  let machineId: string;
  let productId: string;

  beforeEach(() => {
    const locations = new FakeLocationRepository();
    machines = new FakeMachineRepository();
    products = new FakeProductRepository();
    planograms = new FakePlanogramRepository();
    service = new PlanogramServiceImpl(planograms, machines, products);
    const locationId = locations.seed(ORG, locationInput()).id;
    machineId = machines.seed(
      ORG,
      machineInput({ locationId, slots: [["A1", "A2"], ["B1"]] }),
    ).id;
    productId = products.seed(ORG, productInput()).id;
  });

  const slot = (over: Record<string, unknown> = {}) => ({
    slotCode: "A1",
    productId,
    par: 10,
    priceCents: 175,
    ...over,
  });

  it("creates a version for valid slots", async () => {
    const created = await service.create(ORG, {
      machineId,
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      slots: [slot(), slot({ slotCode: "A2" })],
    });
    expect(created.slots).toHaveLength(2);
  });

  it("rejects a slot code the machine doesn't have", async () => {
    await expect(
      service.create(ORG, {
        machineId,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        slots: [slot({ slotCode: "Z9" })],
      }),
    ).rejects.toThrow(/Z9/);
  });

  it("keeps a mixed slot's products in front-to-back order", async () => {
    const behindId = products.seed(ORG, productInput({ name: "Wavy Lay's" })).id;

    const created = await service.create(ORG, {
      machineId,
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      slots: [slot(), slot({ productId: behindId })],
    });

    expect(created.slots.map((s) => s.productId)).toEqual([productId, behindId]);
  });

  it("rejects the same product twice in one slot", async () => {
    await expect(
      service.create(ORG, {
        machineId,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        slots: [slot(), slot()],
      }),
    ).rejects.toThrow(/duplicate/i);
  });

  it("rejects a mixed slot with two prices", async () => {
    const behindId = products.seed(ORG, productInput({ name: "Wavy Lay's" })).id;

    await expect(
      service.create(ORG, {
        machineId,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        slots: [slot(), slot({ productId: behindId, priceCents: 200 })],
      }),
    ).rejects.toThrow(/price/i);
  });

  it("rejects unknown product ids", async () => {
    await expect(
      service.create(ORG, {
        machineId,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        slots: [slot({ productId: "ghost" })],
      }),
    ).rejects.toThrow(/product/i);
  });

  it("rejects a version not strictly newer than the current one", async () => {
    await service.create(ORG, {
      machineId,
      effectiveFrom: "2026-09-02T00:00:00.000Z",
      slots: [slot()],
    });
    await expect(
      service.create(ORG, {
        machineId,
        effectiveFrom: "2026-09-01T00:00:00.000Z",
        slots: [slot()],
      }),
    ).rejects.toThrow(/newer/i);
  });

  it("getCurrent returns the latest version", async () => {
    await service.create(ORG, {
      machineId,
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      slots: [slot()],
    });
    await service.create(ORG, {
      machineId,
      effectiveFrom: "2026-09-08T00:00:00.000Z",
      slots: [slot({ par: 12 })],
    });
    const current = await service.getCurrent(ORG, machineId);
    expect(current?.slots[0]?.par).toBe(12);
  });
});
