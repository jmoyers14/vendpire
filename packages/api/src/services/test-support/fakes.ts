import type { CostBasisLine } from "@vendpire/domain";
import type {
  Location,
  LocationInput,
  LocationRepository,
  Machine,
  MachineInput,
  MachineRepository,
  MachineTemplate,
  MachineTemplateInput,
  MachineTemplateRepository,
  Planogram,
  PlanogramInput,
  PlanogramRepository,
  Product,
  ProductInput,
  ProductRepository,
  Purchase,
  PurchaseInput,
  PurchaseListQuery,
  PurchasePage,
  PurchaseRepository,
  PurchaseUpdate,
  Pack,
  PackInput,
  PackRepository,
  Visit,
  VisitInput,
  VisitListFilter,
  VisitRange,
  VisitRepository,
} from "@vendpire/platform";

/**
 * In-memory fakes of the repository ports, for service unit tests. They honor
 * the same contracts the Mongoose impls do (org scoping, soft-delete filtering)
 * with plain arrays, so service rules are tested without a database.
 */

let nextId = 1;
// ObjectId-shaped: the purchase cursor validates 24 hex characters before it
// will touch Mongo, so a bare "1" would be rejected. Zero-padded decimal also
// sorts lexicographically the way it sorts numerically — the property the
// keyset tiebreaker relies on.
const newId = (): string => String(nextId++).padStart(24, "0");
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
  async findByIdIncludingDeleted(
    orgId: string,
    id: string,
  ): Promise<Location | null> {
    return this.rows.find((r) => r.orgId === orgId && r.id === id) ?? null;
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
  async findByIdIncludingDeleted(
    orgId: string,
    id: string,
  ): Promise<Machine | null> {
    return this.rows.find((r) => r.orgId === orgId && r.id === id) ?? null;
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

export class FakeMachineTemplateRepository implements MachineTemplateRepository {
  rows: Stored<MachineTemplate>[] = [];

  seed(orgId: string, input: MachineTemplateInput): MachineTemplate {
    const row: Stored<MachineTemplate> = {
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

  async findByOrg(orgId: string): Promise<MachineTemplate[]> {
    return this.rows.filter((r) => r.orgId === orgId && !r.deleted);
  }
  async findById(orgId: string, id: string): Promise<MachineTemplate | null> {
    return (
      this.rows.find((r) => r.orgId === orgId && r.id === id && !r.deleted) ??
      null
    );
  }
  async create(
    orgId: string,
    data: MachineTemplateInput,
  ): Promise<MachineTemplate> {
    return this.seed(orgId, data);
  }
  async update(
    orgId: string,
    id: string,
    data: MachineTemplateInput,
  ): Promise<MachineTemplate | null> {
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
  async findExistingIdsIncludingDeleted(
    orgId: string,
    ids: string[],
  ): Promise<Set<string>> {
    const existing = this.rows
      .filter((r) => r.orgId === orgId && ids.includes(r.id))
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

/**
 * Descending (purchasedAt, id) — the same total order the real compound index
 * gives. ISO-Z strings and zero-padded ids both compare correctly as strings.
 */
const byNewestThenId = (a: Purchase, b: Purchase): number =>
  b.purchasedAt.localeCompare(a.purchasedAt) || b.id.localeCompare(a.id);

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

  async findPageByOrg(
    orgId: string,
    query: PurchaseListQuery,
  ): Promise<PurchasePage> {
    const cursor = query.cursor;
    const matching = this.rows
      .filter((r) => r.orgId === orgId && !r.deleted)
      .filter((r) => (query.from ? r.purchasedAt >= query.from : true))
      .filter((r) => (query.to ? r.purchasedAt <= query.to : true))
      // Strictly past the cursor position, mirroring the $or in
      // purchaseListFilter — including the equality-plus-id branch, so page
      // boundaries inside a shared purchasedAt are observable in tests.
      .filter((r) =>
        cursor
          ? r.purchasedAt < cursor.purchasedAt ||
            (r.purchasedAt === cursor.purchasedAt && r.id < cursor.id)
          : true,
      )
      .sort(byNewestThenId);
    return {
      items: matching.slice(0, query.limit),
      hasMore: matching.length > query.limit,
    };
  }
  async findById(orgId: string, id: string): Promise<Purchase | null> {
    return (
      this.rows.find((r) => r.orgId === orgId && r.id === id && !r.deleted) ??
      null
    );
  }
  async findCostBasisLines(orgId: string): Promise<CostBasisLine[]> {
    return this.rows
      .filter((r) => r.orgId === orgId && !r.deleted)
      .flatMap((r) =>
        r.lines.map((line) => ({
          productId: line.productId,
          units: line.units,
          totalCostCents: line.totalCostCents,
        })),
      );
  }
  async findByClientRequestId(
    orgId: string,
    clientRequestId: string,
  ): Promise<Purchase | null> {
    return (
      this.rows.find(
        (r) => r.orgId === orgId && r.clientRequestId === clientRequestId,
      ) ?? null
    );
  }
  async create(orgId: string, data: PurchaseInput): Promise<Purchase> {
    return this.seed(orgId, data);
  }
  async update(
    orgId: string,
    id: string,
    data: PurchaseUpdate,
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
  commission: { type: "none" },
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
  templateId: null,
  slots: [["A1", "A2"]],
  cardReader: null,
  active: true,
  ...over,
});

export const machineTemplateInput = (
  over: Partial<MachineTemplateInput> = {},
): MachineTemplateInput => ({
  name: "Snack — 2 shelves",
  kind: "snack",
  make: null,
  model: null,
  slots: [["A1", "A2"]],
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

/**
 * Total order by (countedAt, createdAt, id) ascending — what the real compound
 * index gives and what the engine requires. countedAt is compared as an INSTANT
 * rather than a string: the write contract accepts any ISO-8601 offset, and
 * "02:00-08:00" sorts before "09:00+00:00" lexicographically while falling an
 * hour after it in real time.
 */
const byVisitOrder = (a: Visit, b: Visit): number =>
  Date.parse(a.countedAt) - Date.parse(b.countedAt) ||
  Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
  a.id.localeCompare(b.id);

export class FakeVisitRepository implements VisitRepository {
  rows: Stored<Visit>[] = [];

  seed(orgId: string, input: VisitInput): Visit {
    const clash = this.rows.find(
      (r) => r.orgId === orgId && r.clientRequestId === input.clientRequestId,
    );
    // The unique index is the whole idempotency guarantee, so the fake raises
    // the same E11000 the service's create/catch/re-read path exists to handle.
    // Without this the race branch is untestable and silently rots.
    if (clash) {
      throw Object.assign(new Error("E11000 duplicate key error"), {
        code: 11000,
      });
    }
    const row: Stored<Visit> = {
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

  private live(orgId: string): Stored<Visit>[] {
    return this.rows.filter((r) => r.orgId === orgId && !r.deleted);
  }

  async findByOrg(orgId: string, filter: VisitListFilter = {}): Promise<Visit[]> {
    const matching = this.live(orgId)
      .filter((r) => (filter.machineId ? r.machineId === filter.machineId : true))
      .filter((r) =>
        filter.from ? Date.parse(r.countedAt) >= Date.parse(filter.from) : true,
      )
      .filter((r) =>
        filter.to ? Date.parse(r.countedAt) <= Date.parse(filter.to) : true,
      )
      .sort((a, b) => byVisitOrder(b, a));
    return filter.limit ? matching.slice(0, filter.limit) : matching;
  }

  async findByMachineAscending(
    orgId: string,
    machineId: string,
    range: VisitRange = {},
  ): Promise<Visit[]> {
    const ofMachine = this.live(orgId)
      .filter((r) => r.machineId === machineId)
      .sort(byVisitOrder);
    const window = ofMachine
      .filter((r) =>
        range.from ? Date.parse(r.countedAt) >= Date.parse(range.from) : true,
      )
      .filter((r) =>
        range.to ? Date.parse(r.countedAt) <= Date.parse(range.to) : true,
      );

    if (!range.from) {
      return window;
    }
    // STRICTLY before the window, so a visit stamped exactly at `from` is not
    // returned twice and paired against itself for a zero-length interval.
    const predecessor = ofMachine
      .filter((r) => Date.parse(r.countedAt) < Date.parse(range.from as string))
      .at(-1);
    return predecessor ? [predecessor, ...window] : window;
  }

  async findLatestByOrg(orgId: string): Promise<Visit[]> {
    const byMachine = new Map<string, Visit>();
    for (const row of this.live(orgId).sort(byVisitOrder)) {
      byMachine.set(row.machineId, row);
    }
    return [...byMachine.values()];
  }

  async findLatestByMachine(
    orgId: string,
    machineId: string,
  ): Promise<Visit | null> {
    return (
      this.live(orgId)
        .filter((r) => r.machineId === machineId)
        .sort(byVisitOrder)
        .at(-1) ?? null
    );
  }

  async findById(orgId: string, id: string): Promise<Visit | null> {
    return this.live(orgId).find((r) => r.id === id) ?? null;
  }

  async findByClientRequestId(
    orgId: string,
    clientRequestId: string,
  ): Promise<Visit | null> {
    // Soft-deleted rows included, matching the real read: a retry of a submit
    // whose visit was since deleted must get that visit back, not create a
    // second one the unique index would reject anyway.
    return (
      this.rows.find(
        (r) => r.orgId === orgId && r.clientRequestId === clientRequestId,
      ) ?? null
    );
  }

  async create(orgId: string, data: VisitInput): Promise<Visit> {
    return this.seed(orgId, data);
  }

  async softDelete(orgId: string, id: string): Promise<void> {
    const row = this.rows.find((r) => r.orgId === orgId && r.id === id);
    if (row) {
      row.deleted = true;
    }
  }
}

export const visitInput = (over: Partial<VisitInput> = {}): VisitInput => ({
  machineId: "mach-1",
  locationId: "loc-1",
  planogramId: null,
  countedAt: "2026-09-20T17:00:00.000Z",
  recordedByUserId: "user_1",
  lines: [
    {
      slotCode: "A1",
      productId: "prod-1",
      remaining: 4,
      added: 6,
      removed: 0,
      removedReason: null,
      priceCents: 175,
      par: 10,
    },
  ],
  notes: null,
  clientRequestId: "req_1",
  ...over,
});
