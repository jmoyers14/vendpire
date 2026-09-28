import type {
  Location,
  LocationInput,
  LocationRepository,
  Machine,
  MachineInput,
  MachineRepository,
  Planogram,
  PlanogramInput,
  PlanogramRepository,
  Product,
  ProductInput,
  ProductRepository,
  Purchase,
  PurchaseInput,
  PurchaseRepository,
  Pack,
  PackInput,
  PackRepository,
} from "@vendpire/platform";

/**
 * In-memory fakes of the repository ports, for service unit tests. They honor
 * the same contracts the Mongoose impls do (org scoping, soft-delete filtering)
 * with plain arrays, so service rules are tested without a database.
 */

let nextId = 1;
const newId = (): string => String(nextId++);
const now = (): string => new Date().toISOString();

type Stored<T> = T & { orgId: string; deleted: boolean };

export class FakeLocationRepository implements LocationRepository {
  rows: Stored<Location>[] = [];

  seed(orgId: string, input: LocationInput): Location {
    const row: Stored<Location> = {
      ...input,
      id: newId(),
      createdAt: now(),
      updatedAt: now(),
      orgId,
      deleted: false,
    };
    this.rows.push(row);
    return row;
  }

  async findByOrg(orgId: string): Promise<Location[]> {
    return this.rows.filter((r) => r.orgId === orgId && !r.deleted);
  }
  async findById(orgId: string, id: string): Promise<Location | null> {
    return (
      this.rows.find((r) => r.orgId === orgId && r.id === id && !r.deleted) ??
      null
    );
  }
  async create(orgId: string, data: LocationInput): Promise<Location> {
    return this.seed(orgId, data);
  }
  async update(
    orgId: string,
    id: string,
    data: LocationInput,
  ): Promise<Location | null> {
    const row = this.rows.find(
      (r) => r.orgId === orgId && r.id === id && !r.deleted,
    );
    if (!row) {
      return null;
    }
    Object.assign(row, data, { updatedAt: now() });
    return row;
  }
  async softDelete(orgId: string, id: string): Promise<void> {
    const row = this.rows.find((r) => r.orgId === orgId && r.id === id);
    if (row) {
      row.deleted = true;
    }
  }
}

export class FakeMachineRepository implements MachineRepository {
  rows: Stored<Machine>[] = [];

  seed(orgId: string, input: MachineInput): Machine {
    const row: Stored<Machine> = {
      ...input,
      id: newId(),
      createdAt: now(),
      updatedAt: now(),
      orgId,
      deleted: false,
    };
    this.rows.push(row);
    return row;
  }

  async findByOrg(orgId: string): Promise<Machine[]> {
    return this.rows.filter((r) => r.orgId === orgId && !r.deleted);
  }
  async findById(orgId: string, id: string): Promise<Machine | null> {
    return (
      this.rows.find((r) => r.orgId === orgId && r.id === id && !r.deleted) ??
      null
    );
  }
  async findByTagCode(orgId: string, tagCode: string): Promise<Machine | null> {
    return (
      this.rows.find(
        (r) => r.orgId === orgId && r.tagCode === tagCode && !r.deleted,
      ) ?? null
    );
  }
  async countByLocation(orgId: string, locationId: string): Promise<number> {
    return this.rows.filter(
      (r) => r.orgId === orgId && r.locationId === locationId && !r.deleted,
    ).length;
  }
  async create(orgId: string, data: MachineInput): Promise<Machine> {
    return this.seed(orgId, data);
  }
  async update(
    orgId: string,
    id: string,
    data: MachineInput,
  ): Promise<Machine | null> {
    const row = this.rows.find(
      (r) => r.orgId === orgId && r.id === id && !r.deleted,
    );
    if (!row) {
      return null;
    }
    Object.assign(row, data, { updatedAt: now() });
    return row;
  }
  async softDelete(orgId: string, id: string): Promise<void> {
    const row = this.rows.find((r) => r.orgId === orgId && r.id === id);
    if (row) {
      row.deleted = true;
    }
  }
}

export class FakeProductRepository implements ProductRepository {
  rows: Stored<Product>[] = [];

  seed(orgId: string, input: ProductInput): Product {
    const row: Stored<Product> = {
      ...input,
      id: newId(),
      createdAt: now(),
      updatedAt: now(),
      orgId,
      deleted: false,
    };
    this.rows.push(row);
    return row;
  }

  async findByOrg(orgId: string): Promise<Product[]> {
    return this.rows.filter((r) => r.orgId === orgId && !r.deleted);
  }
  async findById(orgId: string, id: string): Promise<Product | null> {
    return (
      this.rows.find((r) => r.orgId === orgId && r.id === id && !r.deleted) ??
      null
    );
  }
  async findByUpc(orgId: string, upc: string): Promise<Product | null> {
    return (
      this.rows.find((r) => r.orgId === orgId && r.upc === upc && !r.deleted) ??
      null
    );
  }
  async findExistingIds(orgId: string, ids: string[]): Promise<Set<string>> {
    const existing = this.rows
      .filter((r) => r.orgId === orgId && !r.deleted && ids.includes(r.id))
      .map((r) => r.id);
    return new Set(existing);
  }
  async create(orgId: string, data: ProductInput): Promise<Product> {
    return this.seed(orgId, data);
  }
  async update(
    orgId: string,
    id: string,
    data: ProductInput,
  ): Promise<Product | null> {
    const row = this.rows.find(
      (r) => r.orgId === orgId && r.id === id && !r.deleted,
    );
    if (!row) {
      return null;
    }
    Object.assign(row, data, { updatedAt: now() });
    return row;
  }
  async softDelete(orgId: string, id: string): Promise<void> {
    const row = this.rows.find((r) => r.orgId === orgId && r.id === id);
    if (row) {
      row.deleted = true;
    }
  }
}

export class FakePlanogramRepository implements PlanogramRepository {
  rows: Stored<Planogram>[] = [];

  seed(orgId: string, input: PlanogramInput): Planogram {
    const row: Stored<Planogram> = {
      ...input,
      id: newId(),
      createdAt: now(),
      updatedAt: now(),
      orgId,
      deleted: false,
    };
    this.rows.push(row);
    return row;
  }

  async findByMachine(orgId: string, machineId: string): Promise<Planogram[]> {
    return this.rows
      .filter(
        (r) => r.orgId === orgId && r.machineId === machineId && !r.deleted,
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  }
  async findCurrentByMachine(
    orgId: string,
    machineId: string,
  ): Promise<Planogram | null> {
    const versions = await this.findByMachine(orgId, machineId);
    return versions[0] ?? null;
  }
  async findCurrentByOrg(orgId: string): Promise<Planogram[]> {
    const byMachine = new Map<string, Planogram>();
    for (const row of this.rows) {
      if (row.orgId !== orgId || row.deleted) {
        continue;
      }
      const current = byMachine.get(row.machineId);
      if (!current || row.effectiveFrom > current.effectiveFrom) {
        byMachine.set(row.machineId, row);
      }
    }
    return [...byMachine.values()];
  }
  async countByMachine(orgId: string, machineId: string): Promise<number> {
    return (await this.findByMachine(orgId, machineId)).length;
  }
  async create(orgId: string, data: PlanogramInput): Promise<Planogram> {
    return this.seed(orgId, data);
  }
}

export class FakePurchaseRepository implements PurchaseRepository {
  rows: Stored<Purchase>[] = [];

  seed(orgId: string, input: PurchaseInput): Purchase {
    const row: Stored<Purchase> = {
      ...input,
      id: newId(),
      createdAt: now(),
      updatedAt: now(),
      orgId,
      deleted: false,
    };
    this.rows.push(row);
    return row;
  }

  async findByOrg(orgId: string): Promise<Purchase[]> {
    return this.rows.filter((r) => r.orgId === orgId && !r.deleted);
  }
  async findById(orgId: string, id: string): Promise<Purchase | null> {
    return (
      this.rows.find((r) => r.orgId === orgId && r.id === id && !r.deleted) ??
      null
    );
  }
  async create(orgId: string, data: PurchaseInput): Promise<Purchase> {
    return this.seed(orgId, data);
  }
  async update(
    orgId: string,
    id: string,
    data: PurchaseInput,
  ): Promise<Purchase | null> {
    const row = this.rows.find(
      (r) => r.orgId === orgId && r.id === id && !r.deleted,
    );
    if (!row) {
      return null;
    }
    Object.assign(row, data, { updatedAt: now() });
    return row;
  }
  async softDelete(orgId: string, id: string): Promise<void> {
    const row = this.rows.find((r) => r.orgId === orgId && r.id === id);
    if (row) {
      row.deleted = true;
    }
  }
}

/** Minimal valid inputs, spread-overridable per test. */
export const locationInput = (over: Partial<LocationInput> = {}): LocationInput => ({
  name: "Break Room A",
  address: { line1: null, city: null, state: null, zip: null, geo: null },
  contact: { name: null, phone: null, email: null },
  commission: { type: "none", percentBps: null, flatCents: null, basis: null },
  notes: null,
  active: true,
  ...over,
});

export const machineInput = (over: Partial<MachineInput> = {}): MachineInput => ({
  locationId: "loc-1",
  name: "Snack machine",
  kind: "snack",
  make: null,
  model: null,
  serial: null,
  tagCode: null,
  slots: [["A1", "A2"]],
  cardReader: null,
  active: true,
  ...over,
});

export const productInput = (over: Partial<ProductInput> = {}): ProductInput => ({
  name: "Doritos Nacho",
  upc: null,
  category: "chips",
  imageUrl: null,
  taxClass: null,
  defaultPriceCents: 175,
  active: true,
  ...over,
});

export class FakePackRepository implements PackRepository {
  rows: Stored<Pack>[] = [];

  seed(orgId: string, input: PackInput): Pack {
    const row: Stored<Pack> = {
      ...input,
      id: newId(),
      createdAt: now(),
      updatedAt: now(),
      orgId,
      deleted: false,
    };
    this.rows.push(row);
    return row;
  }

  async findByOrg(orgId: string): Promise<Pack[]> {
    return this.rows.filter((r) => r.orgId === orgId && !r.deleted);
  }
  async findById(orgId: string, id: string): Promise<Pack | null> {
    return (
      this.rows.find((r) => r.orgId === orgId && r.id === id && !r.deleted) ??
      null
    );
  }
  async findByBarcode(orgId: string, gtin14: string): Promise<Pack | null> {
    return (
      this.rows.find(
        (r) => r.orgId === orgId && r.barcodes.includes(gtin14) && !r.deleted,
      ) ?? null
    );
  }
  async countByProduct(orgId: string, productId: string): Promise<number> {
    return this.rows.filter(
      (r) =>
        r.orgId === orgId &&
        !r.deleted &&
        r.contents.some((content) => content.productId === productId),
    ).length;
  }
  async create(orgId: string, data: PackInput): Promise<Pack> {
    return this.seed(orgId, data);
  }
  async update(orgId: string, id: string, data: PackInput): Promise<Pack | null> {
    const row = this.rows.find(
      (r) => r.orgId === orgId && r.id === id && !r.deleted,
    );
    if (!row) {
      return null;
    }
    Object.assign(row, data, { updatedAt: now() });
    return row;
  }
  async softDelete(orgId: string, id: string): Promise<void> {
    const row = this.rows.find((r) => r.orgId === orgId && r.id === id);
    if (row) {
      row.deleted = true;
    }
  }
}
