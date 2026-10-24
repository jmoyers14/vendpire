# Expiration Date Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a best-by date on every stocked slot so nothing past its date is ever sold out of a machine.

**Architecture:** One nullable `bestBy` calendar date per visit line, meaning *the date on the unit that sells next* — the front one. Pre-filled from the previous visit and overwritten when the operator puts in stock with a different date. A new `visits.expiringSoon` query reads only the latest visit per machine and buckets stocked slots into expired / expiring-soon / no-date-recorded. Strictly additive: no revenue, COGS, write-off or profit figure reads `bestBy`, and `added` keeps its `number` type so `levelAfter` is untouched.

**Tech Stack:** Bun workspaces, TypeScript, Mongoose, tRPC, tsyringe, React + Vite + Tailwind + TanStack Query, `bun:test`

**Spec:** `docs/superpowers/specs/2026-10-08-expiration-tracking-design.md`

## Global Constraints

- **Calendar dates are `"YYYY-MM-DD"` strings, never `Date`.** A best-by has no time and no zone; an instant acquires both and reports the wrong day across offsets. The spelling is zero-padded and big-endian, so lexicographic order is chronological order.
- **All date arithmetic is fixed to UTC.** Local-zone arithmetic shifts a best-by by a day across a DST boundary.
- **`bestBy: null` means NO DATE RECORDED, never "does not expire".** The `missingDates` bucket exists to keep an empty report from reading as "all clear".
- **Never coerce a blank date to a value.** Same rule as `VisitRow.left`: `""` is a distinct fact, not a zero.
- **The field's meaning is "the front (next-to-sell, oldest) unit's date."** State it in the schema comment, the domain type, and the form hint. Label the input **"Best by"**, never "Expires".
- **Imports use explicit `.ts` extensions.** Money is integer cents; percentages are basis points.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`). Do not hand-edit the root `package.json` version or the changelog.
- **Naming:** see `CLAUDE.md`. Acronyms are words in TypeScript (`tripApi`). Configuration arguments go in an options object, never positional booleans.
- Checks: `bun run typecheck`, `bun run lint`, `bun run test`

---

### Task 1: Domain — the `bestBy` field and the expiration module

**Files:**
- Modify: `packages/domain/src/visits/types.ts` (add `bestBy` to `VisitLine`)
- Create: `packages/domain/src/visits/expiration.ts`
- Create: `packages/domain/src/visits/expiration.test.ts`
- Modify: `packages/domain/src/index.ts` (barrel export)
- Modify: `packages/domain/src/index.test.ts` (barrel export assertions)
- Modify: `packages/domain/src/visits/sold.test.ts` (fixture gains `bestBy`)

**Interfaces:**
- Consumes: `levelAfter(line: VisitLine): number` from `./sold.ts`; `VisitObservation` from `./types.ts`
- Produces: `type CalendarDate = string`; `interface SlotExpiration { slotCode, productId, bestBy: CalendarDate | null, units: number }`; `expirationsForVisit(visit: VisitObservation): SlotExpiration[]`; `dateAfter(date: CalendarDate, days: number): CalendarDate`; `daysUntil(bestBy: CalendarDate, asOf: CalendarDate): number`

- [ ] **Step 1: Add `bestBy` to the domain `VisitLine`**

In `packages/domain/src/visits/types.ts`, inside `interface VisitLine`, directly after the `par` field:

```ts
  /**
   * The date on the unit that SELLS NEXT — the front one, which is both the
   * oldest in the slot (coils load from the back) and the only one readable
   * without unloading it. A calendar date, "YYYY-MM-DD", never an instant.
   *
   * Null means NO DATE WAS RECORDED, never "does not expire". That
   * distinction is what `Product.tracksExpiration` carries, and what keeps an
   * empty expiry report from reading as "nothing is expiring" when it means
   * "nobody typed anything".
   */
  readonly bestBy: string | null;
```

- [ ] **Step 2: Fix the existing fixture so the suite compiles**

In `packages/domain/src/visits/sold.test.ts`, add `bestBy: null,` to the `line()` helper's returned object, directly after `par: null,` and before `...overrides`.

- [ ] **Step 3: Run the existing domain tests to confirm nothing else broke**

Run: `bun run --cwd packages/domain test`
Expected: PASS. The new field is optional to every existing calculation — if anything fails here, the change was not additive and must be re-read before continuing.

- [ ] **Step 4: Write the failing tests for the expiration module**

Create `packages/domain/src/visits/expiration.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { VisitLine, VisitObservation } from "./types.ts";
import { dateAfter, daysUntil, expirationsForVisit } from "./expiration.ts";

const line = (
  slotCode: string,
  productId: string,
  remaining: number,
  added: number,
  overrides: Partial<VisitLine> = {},
): VisitLine => ({
  slotCode,
  productId,
  remaining,
  added,
  removed: 0,
  removedReason: null,
  priceCents: 150,
  par: null,
  bestBy: null,
  ...overrides,
});

const visit = (lines: VisitLine[]): VisitObservation => ({
  id: "v1",
  machineId: "m1",
  countedAt: "2026-10-17T09:00:00Z",
  createdAt: "2026-10-17T09:00:00Z",
  lines,
});

describe("dateAfter", () => {
  it("crosses a month end", () => {
    expect(dateAfter("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("crosses a year end", () => {
    expect(dateAfter("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("produces a leap day", () => {
    expect(dateAfter("2028-02-28", 1)).toBe("2028-02-29");
  });

  // Fixed to UTC, so the US spring-forward boundary is a plain 24 hours and
  // cannot shift the result by a day.
  it("crosses a DST boundary without shifting", () => {
    expect(dateAfter("2026-03-07", 1)).toBe("2026-03-08");
    expect(dateAfter("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("adds zero days", () => {
    expect(dateAfter("2026-10-17", 0)).toBe("2026-10-17");
  });
});

describe("daysUntil", () => {
  it("counts forward", () => {
    expect(daysUntil("2026-10-27", "2026-10-17")).toBe(10);
  });

  it("is zero on the day", () => {
    expect(daysUntil("2026-10-17", "2026-10-17")).toBe(0);
  });

  it("goes negative once expired", () => {
    expect(daysUntil("2026-10-15", "2026-10-17")).toBe(-2);
  });
});

describe("expirationsForVisit", () => {
  it("reports units as the level AFTER the fill, not what was found", () => {
    // Found 5, binned 2, added 5 -> 8 in the slot when you walk away.
    const result = expirationsForVisit(
      visit([
        line("B3", "doritos", 5, 5, {
          removed: 2,
          removedReason: "expired",
          bestBy: "2026-12-15",
        }),
      ]),
    );
    expect(result).toEqual([
      { slotCode: "B3", productId: "doritos", bestBy: "2026-12-15", units: 8 },
    ]);
  });

  it("excludes a slot with nothing in it", () => {
    const result = expirationsForVisit(
      visit([line("B1", "poptarts", 0, 0, { bestBy: "2026-11-30" })]),
    );
    expect(result).toEqual([]);
  });

  // The sole source for the report's `missingDates` bucket. Dropping these is
  // what would make an empty report read as "all clear".
  it("RETAINS a stocked slot with no date recorded", () => {
    const result = expirationsForVisit(visit([line("A1", "snickers", 11, 1)]));
    expect(result).toEqual([
      { slotCode: "A1", productId: "snickers", bestBy: null, units: 12 },
    ]);
  });

  it("returns one row per slot and product pair", () => {
    const result = expirationsForVisit(
      visit([
        line("B3", "doritos", 5, 5, { bestBy: "2026-12-15" }),
        line("B3", "cheetos", 2, 3, { bestBy: "2027-01-20" }),
        line("C1", "muffin", 0, 4, { bestBy: "2026-10-22" }),
      ]),
    );
    expect(result).toHaveLength(3);
    expect(result.map((row) => row.slotCode)).toEqual(["B3", "B3", "C1"]);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `bun run --cwd packages/domain test expiration`
Expected: FAIL — cannot resolve `./expiration.ts`.

- [ ] **Step 6: Write the expiration module**

Create `packages/domain/src/visits/expiration.ts`:

```ts
import { levelAfter } from "./sold.ts";
import type { VisitObservation } from "./types.ts";

/**
 * What is in a machine right now, and when it goes bad.
 *
 * The one job here is that nothing past its date is ever sold. Everything is
 * read off the LATEST visit per machine and nothing else: a best-by is a
 * standing fact about a slot's contents, so the most recent observation is the
 * whole answer and the visit sequence is irrelevant. That is deliberate — the
 * richer designs (staleness detection from cumulative sold units, per-lot dated
 * additions) are recorded as rejected in the spec, with their revisit trigger.
 */

/**
 * A calendar date, "YYYY-MM-DD". NOT an instant: "best by Dec 15" has no time
 * and no zone, and storing it as one shifts the day for anyone reading it from
 * a different offset than the device that captured it. Because the spelling is
 * zero-padded and big-endian, lexicographic order IS chronological order, which
 * is what the report sorts and filters on — no parsing in the hot path.
 */
export type CalendarDate = string;

export interface SlotExpiration {
  readonly slotCode: string;
  readonly productId: string;
  /** Null when no date was recorded. The service buckets those separately. */
  readonly bestBy: CalendarDate | null;
  /** What is in the slot NOW — `levelAfter(line)`, not `remaining`. */
  readonly units: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Parsed at UTC midnight, always. Local-zone arithmetic shifts a best-by date
 * by a day across a DST boundary, which is a silent off-by-one in a report
 * whose entire job is to be trusted about dates.
 */
const atUtcMidnight = (date: CalendarDate): number =>
  Date.parse(`${date}T00:00:00Z`);

export const dateAfter = (date: CalendarDate, days: number): CalendarDate => {
  const at = new Date(atUtcMidnight(date));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

/** Negative once the date has passed. */
export const daysUntil = (bestBy: CalendarDate, asOf: CalendarDate): number =>
  Math.round((atUtcMidnight(bestBy) - atUtcMidnight(asOf)) / MS_PER_DAY);

/**
 * Every STOCKED slot from one visit, dated or not.
 *
 * Excludes `levelAfter === 0` only — nothing in the slot, nothing to expire.
 * Undated rows are RETURNED, not filtered: they are the sole source for the
 * report's `missingDates` bucket. Whether a null actually matters depends on
 * `Product.tracksExpiration`, which is product data this package does not take,
 * so that judgement belongs to the service rather than here.
 */
export const expirationsForVisit = (
  visit: VisitObservation,
): SlotExpiration[] => {
  const expirations: SlotExpiration[] = [];
  for (const line of visit.lines) {
    const units = levelAfter(line);
    if (units === 0) {
      continue;
    }
    expirations.push({
      slotCode: line.slotCode,
      productId: line.productId,
      bestBy: line.bestBy,
      units,
    });
  }
  return expirations;
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run --cwd packages/domain test expiration`
Expected: PASS — 12 tests.

- [ ] **Step 8: Export from the barrel**

In `packages/domain/src/index.ts`, add after the `export * from "./visits/sold.ts";` line:

```ts
export * from "./visits/expiration.ts";
```

In `packages/domain/src/index.test.ts`, add these three names to the array in the `for` loop, after `"intervalsForMachine",`:

```ts
    "expirationsForVisit",
    "dateAfter",
    "daysUntil",
```

- [ ] **Step 9: Run the full domain suite**

Run: `bun run --cwd packages/domain test && bun run --cwd packages/domain typecheck`
Expected: PASS both. The barrel is the only entry point, so a module that never got re-exported is invisible to api and web.

- [ ] **Step 10: Commit**

```bash
git add packages/domain/src
git commit -m "feat(domain): add bestBy to visit lines and the expiration module"
```

---

### Task 2: Platform — persist `bestBy` on the visit line

**Files:**
- Modify: `packages/platform/src/data-access/models/Visit.ts`
- Modify: `packages/platform/src/data-access/repositories/VisitRepository/types.ts`
- Modify: `packages/platform/src/data-access/repositories/VisitRepository/VisitRepositoryImpl.ts:225-232` (the `toVisit` line mapper)
- Test: `packages/platform/src/data-access/repositories/VisitRepository/VisitRepositoryImpl.test.ts`

**Interfaces:**
- Consumes: the domain `VisitLine.bestBy` from Task 1
- Produces: `VisitLine.bestBy: string | null` on the stored entity; `toVisit` defaults a missing field to `null`

**Why this task cannot be skipped or reordered after Task 1:** `types.ts` carries a compile-time proof that the stored shape feeds the engine:

```ts
export type VisitFeedsEngine = Assert<Visit extends VisitObservation ? true : false>;
```

Task 1 added `bestBy` to `VisitObservation`'s line type, so this assertion fails to compile until the stored `VisitLine` gains it too. That is the intended forcing function — do not relax the assertion.

- [ ] **Step 1: Confirm the type proof is currently failing**

Run: `bun run --cwd packages/platform typecheck`
Expected: FAIL on `VisitFeedsEngine` — `Property 'bestBy' is missing`. This is the guardrail doing its job.

- [ ] **Step 2: Add the field to the Mongoose schema**

In `packages/platform/src/data-access/models/Visit.ts`, inside `visitLineSchema`, after the `par` field:

```ts
    /**
     * The date on the unit that SELLS NEXT — the front one, which is both the
     * oldest in the slot (coils load from the back) and the only one readable
     * without unloading it. A calendar date, "YYYY-MM-DD".
     *
     * A STRING, NOT A DATE. "Best by Dec 15" has no time and no zone; stored as
     * an instant it acquires both, and a visit captured at UTC-8 then read in
     * UTC reports the day before. The spelling sorts chronologically as-is.
     *
     * Null means NO DATE WAS RECORDED, never "does not expire" — that is what
     * `Product.tracksExpiration` carries.
     */
    bestBy: { type: String, default: null },
```

- [ ] **Step 3: Add the field to the stored entity type**

In `packages/platform/src/data-access/repositories/VisitRepository/types.ts`, inside `interface VisitLine`, after `par`:

```ts
  /** The front unit's date, "YYYY-MM-DD". Null when none was recorded. */
  bestBy: string | null;
```

- [ ] **Step 4: Map the field, with a default for legacy documents**

In `VisitRepositoryImpl.ts`, inside `toVisit`'s `doc.lines.map(...)`, after `par: line.par ?? null,`:

```ts
      bestBy: line.bestBy ?? null,
```

The `?? null` is load-bearing for the same reason the neighbouring defaults are: a line written before the field existed has no such key, and `undefined` reaching the engine is a different value from `null` to every consumer downstream.

- [ ] **Step 5: Write the round-trip test**

In `VisitRepositoryImpl.test.ts`, add to the `toVisit` describe block:

The file already has a `doc()` builder and derives the document type from the
mapper itself (`type VisitDoc = Parameters<typeof toVisit>[0]`). Add inside the
existing `describe("toVisit", ...)` block, following the shape of the
neighbouring `remaining` / `priceCents` default tests:

```ts
  it("round-trips bestBy", () => {
    const line = { ...baseLine, bestBy: "2026-12-15" };
    expect(toVisit(doc({ lines: [line] })).lines[0]?.bestBy).toBe("2026-12-15");
  });

  it("defaults a line written before the field existed to null", () => {
    // No `bestBy` key at all — not null, absent. `undefined` reaching the
    // engine is a different value from null to every consumer downstream.
    const { bestBy, ...line } = { ...baseLine, bestBy: "2026-12-15" };
    expect(toVisit(doc({ lines: [line] })).lines[0]?.bestBy).toBeNull();
  });
```

Take `baseLine` from whatever the file's existing line literals use (the tests
around `:85-104` build one inline); reuse that rather than adding a new helper.

- [ ] **Step 6: Run the platform suite and typecheck**

Run: `bun run --cwd packages/platform test && bun run --cwd packages/platform typecheck`
Expected: PASS both. `VisitFeedsEngine` now compiles, which is the proof the stored shape still feeds the engine.

- [ ] **Step 7: Commit**

```bash
git add packages/platform/src
git commit -m "feat(platform): persist bestBy on visit lines"
```

---

### Task 3: Platform — `Product.tracksExpiration` and a deleted-tolerant product lookup

**Files:**
- Modify: `packages/platform/src/data-access/models/Product.ts`
- Modify: `packages/platform/src/data-access/repositories/ProductRepository/types.ts`
- Modify: `packages/platform/src/data-access/repositories/ProductRepository/ProductRepository.ts`
- Modify: `packages/platform/src/data-access/repositories/ProductRepository/ProductRepositoryImpl.ts:100-113` (`toProduct`)
- Create: `packages/api/scripts/backfillProductTracksExpiration.ts`
- Test: `packages/platform/src/data-access/repositories/ProductRepository/ProductRepositoryImpl.test.ts`

**Interfaces:**
- Produces: `Product.tracksExpiration: boolean`; `ProductRepository.findByIdsIncludingDeleted(orgId: string, ids: string[]): Promise<Product[]>`
- Consumed by: Task 5 (the report needs product names and the tracking flag, deleted-tolerantly) and Task 8 (the product form checkbox)

**Why a new repository method:** the report must include a **retired** product still sitting in a machine — that is exactly the stock most likely to expire, and dropping its row would hide it. `findByOrg` and `findById` both exclude soft-deleted rows, and `findExistingIdsIncludingDeleted` returns ids only, not names or flags.

- [ ] **Step 1: Add the field to the Mongoose schema**

In `packages/platform/src/data-access/models/Product.ts`, inside `productSchema`, after `active`:

```ts
    /**
     * Whether slot lines for this product are expected to carry a `bestBy`.
     * False for gum, bulk candy, and non-food — things with no useful printed
     * date. Policy lives here so the engine never branches on a category.
     *
     * Required-with-default rather than nullable: "we have not decided" is not
     * a meaningful third state, and a null would have to be guessed at every
     * read. Existing rows are handled by
     * `scripts/backfillProductTracksExpiration.ts`.
     */
    tracksExpiration: { type: Boolean, required: true, default: true },
```

- [ ] **Step 2: Add the field to the entity type**

In `ProductRepository/types.ts`, inside `interface Product`, after `active`:

```ts
  /** Whether slot lines for this product are expected to carry a best-by. */
  tracksExpiration: boolean;
```

`ProductInput` is `Omit<Product, "id" | "createdAt" | "updatedAt">`, so it picks the field up automatically.

- [ ] **Step 3: Map the field**

In `ProductRepositoryImpl.ts`, inside `toProduct`, after `active: doc.active,`:

```ts
    tracksExpiration: doc.tracksExpiration ?? true,
```

The `?? true` covers rows read between deploy and backfill. It matches the schema default so the two cannot disagree.

- [ ] **Step 4: Declare the deleted-tolerant lookup**

In `ProductRepository.ts`, after `findExistingIdsIncludingDeleted`:

```ts
  /**
   * Full products by id, INCLUDING soft-deleted ones. The expiry report needs
   * a retired product's name and tracking flag: a product pulled from the
   * catalog but still sitting in a machine is exactly the stock most likely to
   * go bad, and omitting its row would hide it.
   */
  findByIdsIncludingDeleted(orgId: string, ids: string[]): Promise<Product[]>;
```

- [ ] **Step 5: Write the failing test**

In `ProductRepositoryImpl.test.ts`:

```ts
  it("findByIdsIncludingDeleted returns soft-deleted products", async () => {
    const live = await repo.create(ORG, productInput({ name: "Doritos" }));
    const retired = await repo.create(ORG, productInput({ name: "Zbar" }));
    await repo.softDelete(ORG, retired.id);

    const found = await repo.findByIdsIncludingDeleted(ORG, [
      live.id,
      retired.id,
    ]);
    expect(found.map((p) => p.name).sort()).toEqual(["Doritos", "Zbar"]);
  });

  it("findByIdsIncludingDeleted returns nothing for an empty id list", async () => {
    expect(await repo.findByIdsIncludingDeleted(ORG, [])).toEqual([]);
  });

  it("defaults tracksExpiration to true", async () => {
    const created = await repo.create(ORG, productInput({ name: "Doritos" }));
    expect(created.tracksExpiration).toBe(true);
  });
```

Match the file's existing setup for `repo`, `ORG` and `productInput` rather than introducing new helpers.

- [ ] **Step 6: Run to verify it fails**

Run: `bun run --cwd packages/platform test ProductRepository`
Expected: FAIL — `findByIdsIncludingDeleted is not a function`.

- [ ] **Step 7: Implement the lookup**

In `ProductRepositoryImpl.ts`, beside `findExistingIdsIncludingDeleted`:

```ts
  async findByIdsIncludingDeleted(
    orgId: string,
    ids: string[],
  ): Promise<Product[]> {
    // Guarded because `$in: []` matches nothing but still costs a round trip,
    // and every caller here can legitimately have no ids.
    if (ids.length === 0) {
      return [];
    }
    const docs = await ProductModel.find({
      _id: { $in: ids },
      orgId,
    }).lean<ProductDoc[]>();
    return docs.map(toProduct);
  }
```

Note the deliberate absence of `deletedAt: null` — that omission is the whole point of the method.

- [ ] **Step 8: Run to verify it passes**

Run: `bun run --cwd packages/platform test ProductRepository`
Expected: PASS.

- [ ] **Step 9: Write the backfill script**

Create `packages/api/scripts/backfillProductTracksExpiration.ts`:

```ts
/**
 * One-time migration (2026-10-17): set `tracksExpiration` on every product
 * written before the field became required.
 *
 * The field decides whether a stocked slot with no best-by date is reported as
 * a gap ("nobody recorded a date") or ignored ("this product has no useful
 * printed date"). It is required-with-default rather than nullable, because
 * "undecided" is not a meaningful third state — so historical rows need a
 * value rather than being left absent.
 *
 * True is the right default: most vending stock is dated, and a false positive
 * here costs one checkbox, while a false negative silently drops a product out
 * of the expiry report forever.
 *
 * Run: MONGODB_URI=... bun scripts/backfillProductTracksExpiration.ts
 * Idempotent: only touches documents that still lack the field.
 */
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URI");
  process.exit(1);
}

await mongoose.connect(uri);
const products = mongoose.connection.db!.collection("products");

const result = await products.updateMany(
  { tracksExpiration: { $exists: false } },
  { $set: { tracksExpiration: true } },
);
console.log(`backfilled ${result.modifiedCount} product(s)`);

await mongoose.disconnect();
```

- [ ] **Step 10: Run the platform suite and typecheck**

Run: `bun run --cwd packages/platform test && bun run --cwd packages/platform typecheck`
Expected: PASS both.

- [ ] **Step 11: Commit**

```bash
git add packages/platform/src packages/api/scripts
git commit -m "feat(platform): add Product.tracksExpiration and a deleted-tolerant product lookup"
```

---

### Task 4: API — accept the fields over the wire

**Files:**
- Modify: `packages/api/src/routers/visits.ts:6-24` (`visitLineInput`)
- Modify: `packages/api/src/routers/products.ts:5-13` (`productInput`)
- Test: `packages/api/src/routers/visits.test.ts` (create if the file does not exist)

**Interfaces:**
- Consumes: the stored `VisitLine.bestBy` (Task 2) and `Product.tracksExpiration` (Task 3)
- Produces: `visits.create` accepts `bestBy`; `products.create` / `products.update` accept `tracksExpiration`

- [ ] **Step 1: Write the failing validation tests**

In `packages/api/src/routers/visits.test.ts`, testing the exported zod schema directly:

```ts
import { describe, expect, it } from "bun:test";
import { visitLineInput } from "./visits.ts";

const line = (over: Record<string, unknown> = {}) => ({
  slotCode: "B3",
  productId: "p1",
  remaining: 5,
  added: 5,
  priceCents: 150,
  ...over,
});

describe("visitLineInput bestBy", () => {
  it("accepts a calendar date", () => {
    const parsed = visitLineInput.parse(line({ bestBy: "2026-12-15" }));
    expect(parsed.bestBy).toBe("2026-12-15");
  });

  it("defaults to null when absent", () => {
    expect(visitLineInput.parse(line()).bestBy).toBeNull();
  });

  it("accepts an explicit null — no date recorded is a real answer", () => {
    expect(visitLineInput.parse(line({ bestBy: null })).bestBy).toBeNull();
  });

  // An instant is the exact mistake the string type exists to prevent.
  it("rejects an ISO instant", () => {
    expect(() =>
      visitLineInput.parse(line({ bestBy: "2026-12-15T00:00:00Z" })),
    ).toThrow();
  });

  it("rejects a human-written date", () => {
    expect(() => visitLineInput.parse(line({ bestBy: "Dec 15" }))).toThrow();
  });

  it("rejects an impossible month", () => {
    expect(() => visitLineInput.parse(line({ bestBy: "2026-13-01" }))).toThrow();
  });

  it("rejects a non-padded date, which would break lexicographic ordering", () => {
    expect(() => visitLineInput.parse(line({ bestBy: "2026-1-5" }))).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --cwd packages/api test visits`
Expected: FAIL — `visitLineInput` is not exported, and the date assertions do not hold.

- [ ] **Step 3: Add the field to the visit line input**

In `packages/api/src/routers/visits.ts`, export the schema (change `const visitLineInput` to `export const visitLineInput`) and add inside the object, after `par`:

```ts
    /**
     * The front unit's date, "YYYY-MM-DD". Format only — there is deliberately
     * no "required when the product tracks expiration" refine here: zod cannot
     * see the product, and `VisitServiceImpl.validate` loads product IDS only.
     * The operator standing at the slot is the real enforcement, and the
     * report's `missingDates` bucket is the safety net.
     *
     * The regex rejects the two dangerous spellings: an ISO instant (which
     * drags a zone in) and a non-padded date (which breaks the lexicographic
     * ordering the report depends on).
     */
    bestBy: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
      .nullable()
      .default(null),
```

The month and day alternations are what make `"2026-13-01"` and `"2026-00-10"` fail; a bare `\d{2}` would accept both.

- [ ] **Step 4: Add the field to the product input**

In `packages/api/src/routers/products.ts`, inside `productInput`, after `active`:

```ts
  tracksExpiration: z.boolean().default(true),
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun run --cwd packages/api test visits`
Expected: PASS — 7 tests.

- [ ] **Step 6: Run the full api suite and typecheck**

Run: `bun run --cwd packages/api test && bun run --cwd packages/api typecheck`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routers
git commit -m "feat(api): accept bestBy on visit lines and tracksExpiration on products"
```

---

### Task 5: API — the `visits.expiringSoon` report

**Files:**
- Modify: `packages/api/src/services/VisitService/VisitService.ts` (types + interface method)
- Modify: `packages/api/src/services/VisitService/VisitServiceImpl.ts` (implementation)
- Modify: `packages/api/src/services/VisitService/VisitServiceImpl.test.ts`
- Modify: `packages/api/src/routers/visits.ts` (the query)

**Interfaces:**
- Consumes: `expirationsForVisit`, `dateAfter`, `daysUntil`, `CalendarDate` (Task 1); `ProductRepository.findByIdsIncludingDeleted` (Task 3); existing `VisitRepository.findLatestByOrg`, `MachineRepository.findByOrg`, `LocationRepository.findByOrg`
- Produces: `VisitService.expiringSoon(orgId: string, options: { withinDays: number; asOf?: CalendarDate }): Promise<ExpiringReport>`; tRPC query `visits.expiringSoon`

- [ ] **Step 1: Add the report types and the interface method**

In `VisitService.ts`, add `CalendarDate` to the imports from `@vendpire/domain`. Then add before `export interface VisitService`:

```ts
/** One stocked slot the operator may need to act on before the next trip. */
export interface ExpiringSlot {
  machineId: string;
  machineName: string;
  locationId: string;
  locationName: string;
  slotCode: string;
  productId: string;
  productName: string;
  /** What is in the slot now — the level after the last fill. */
  units: number;
  /** Null only on a `missingDates` row. */
  bestBy: CalendarDate | null;
  /** Negative once expired. Null when there is no date. */
  daysUntil: number | null;
}

export interface ExpiringReport {
  /** Echoed so a caller can label the day the report describes. */
  asOf: CalendarDate;
  withinDays: number;
  /** `bestBy` before today. Pull these. */
  expired: ExpiringSlot[];
  /** today <= bestBy <= today + withinDays. Load replacements. */
  expiringSoon: ExpiringSlot[];
  /**
   * Stocked slots on expiration-tracked products with no date on file. The
   * report's own honesty check: without this bucket an empty `expired` list is
   * indistinguishable from nobody having recorded anything.
   */
  missingDates: ExpiringSlot[];
}

/** Default warning window. Fixed until there is a reason to move it. */
export const DEFAULT_EXPIRY_WINDOW_DAYS = 14;
```

And inside `export interface VisitService`, after `pnl`:

```ts
  /**
   * What is about to go bad, across the whole org. Reads only the LATEST visit
   * per machine: a best-by is a standing fact about a slot's contents, so the
   * most recent observation is the whole answer.
   */
  expiringSoon(
    orgId: string,
    options: { withinDays: number; asOf?: CalendarDate },
  ): Promise<ExpiringReport>;
```

- [ ] **Step 2: Write the failing tests**

In `VisitServiceImpl.test.ts`, add a new describe block inside the existing
`describe("VisitService", ...)`, so it inherits that file's `beforeEach` fakes
(`visits`, `machines`, `locations`, `products`, `service`) and its seeded
`ORG`, `USER`, `machineId`, `locationId`, `cokeId`, `fritosId`, `draft()`.

**The shared fixture seeds a machine with slots `[["A1", "A2"]]`**, and
`validate()` throws `Machine has no slot X` for anything else — so these tests
use `A1`/`A2`, and seed their own wider machine when a third slot is needed.

```ts
describe("expiringSoon", () => {
  const ASOF = "2026-10-17";

  const line = (over: Record<string, unknown> = {}) => ({
    slotCode: "A1",
    productId: cokeId,
    remaining: 0,
    added: 4,
    removed: 0,
    removedReason: null,
    priceCents: 150,
    par: 10,
    bestBy: null,
    ...over,
  });

  const record = (lines: ReturnType<typeof line>[], over = {}) =>
    service.create(ORG, {
      draft: draft({ lines, ...over }),
      recordedByUserId: USER,
    });

  it("buckets expired, expiring-soon, and beyond the window", async () => {
    const wideId = machines.seed(
      ORG,
      machineInput({ locationId, slots: [["A1", "A2", "A3"]] }),
    ).id;
    await record(
      [
        line({ slotCode: "A1", bestBy: "2026-10-06" }), // expired 11 days ago
        line({ slotCode: "A2", bestBy: "2026-10-20" }), // 3 days out
        line({ slotCode: "A3", bestBy: "2026-12-16" }), // 60 days out
      ],
      { machineId: wideId },
    );

    const report = await service.expiringSoon(ORG, {
      withinDays: 14,
      asOf: ASOF,
    });

    expect(report.expired.map((r) => r.slotCode)).toEqual(["A1"]);
    expect(report.expiringSoon.map((r) => r.slotCode)).toEqual(["A2"]);
    expect(report.missingDates).toEqual([]);
    expect(report.asOf).toBe(ASOF);
  });

  it("includes both window edges", async () => {
    await record([
      line({ slotCode: "A1", bestBy: ASOF }),
      line({ slotCode: "A2", bestBy: "2026-10-31" }),
    ]);

    const report = await service.expiringSoon(ORG, {
      withinDays: 14,
      asOf: ASOF,
    });
    expect(report.expiringSoon.map((r) => r.slotCode)).toEqual(["A1", "A2"]);
  });

  it("orders by bestBy ascending, soonest first", async () => {
    await record([
      line({ slotCode: "A1", bestBy: "2026-10-25" }),
      line({ slotCode: "A2", bestBy: "2026-10-19" }),
    ]);

    const report = await service.expiringSoon(ORG, {
      withinDays: 14,
      asOf: ASOF,
    });
    expect(report.expiringSoon.map((r) => r.bestBy)).toEqual([
      "2026-10-19",
      "2026-10-25",
    ]);
  });

  it("reports a stocked, tracked slot with no date as a gap", async () => {
    await record([line({ slotCode: "A1", remaining: 4, added: 0 })]);

    const report = await service.expiringSoon(ORG, {
      withinDays: 14,
      asOf: ASOF,
    });
    expect(report.expired).toEqual([]);
    expect(report.expiringSoon).toEqual([]);
    expect(report.missingDates.map((r) => r.slotCode)).toEqual(["A1"]);
    expect(report.missingDates[0]?.bestBy).toBeNull();
    expect(report.missingDates[0]?.daysUntil).toBeNull();
  });

  it("ignores an undated slot whose product does not track expiration", async () => {
    const gumId = products.seed(
      ORG,
      productInput({ name: "Trident", tracksExpiration: false }),
    ).id;
    await record([line({ slotCode: "A1", productId: gumId, remaining: 7, added: 3 })]);

    const report = await service.expiringSoon(ORG, {
      withinDays: 14,
      asOf: ASOF,
    });
    expect(report.missingDates).toEqual([]);
  });

  it("excludes a slot with nothing in it", async () => {
    await record([
      line({
        slotCode: "A1",
        remaining: 2,
        added: 0,
        removed: 2,
        removedReason: "expired",
        bestBy: "2026-10-06",
      }),
    ]);

    const report = await service.expiringSoon(ORG, {
      withinDays: 14,
      asOf: ASOF,
    });
    expect(report.expired).toEqual([]);
  });

  // A product pulled from the catalog but still in a machine is exactly the
  // stock most likely to go bad.
  it("still reports a retired product", async () => {
    const retiredId = products.seed(ORG, productInput({ name: "Zbar" })).id;
    await record([
      line({ slotCode: "A1", productId: retiredId, bestBy: "2026-10-06" }),
    ]);
    await products.softDelete(ORG, retiredId);

    const report = await service.expiringSoon(ORG, {
      withinDays: 14,
      asOf: ASOF,
    });
    expect(report.expired.map((r) => r.productName)).toEqual(["Zbar"]);
  });

  it("returns empty buckets for an org with no visits", async () => {
    const report = await service.expiringSoon("org_empty", {
      withinDays: 14,
      asOf: ASOF,
    });
    expect(report).toMatchObject({
      expired: [],
      expiringSoon: [],
      missingDates: [],
    });
  });
});
```

Two prerequisites in `packages/api/src/services/test-support/fakes.ts`:
`productInput` must pass `tracksExpiration` through with a `true` default, and
`FakeProductRepository` needs `findByIdsIncludingDeleted` returning seeded
products regardless of soft-delete state (mirroring the real implementation
from Task 3).

- [ ] **Step 3: Run to verify it fails**

Run: `bun run --cwd packages/api test VisitService`
Expected: FAIL — `service.expiringSoon is not a function`.

- [ ] **Step 4: Implement the report**

In `VisitServiceImpl.ts`, add `dateAfter`, `daysUntil`, `expirationsForVisit` to the `@vendpire/domain` import and `ExpiringReport`, `ExpiringSlot`, `CalendarDate` to the `./VisitService.ts` type import. Then add the method:

```ts
  async expiringSoon(
    orgId: string,
    options: { withinDays: number; asOf?: CalendarDate },
  ): Promise<ExpiringReport> {
    const { withinDays } = options;
    // Defaulted here rather than in the signature so a caller can pin the day
    // — the tests do, and a report that silently reads the wall clock is one
    // nobody can write a deterministic test for.
    const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);

    const latest = await this.visits.findLatestByOrg(orgId);
    const empty: ExpiringReport = {
      asOf,
      withinDays,
      expired: [],
      expiringSoon: [],
      missingDates: [],
    };
    if (latest.length === 0) {
      return empty;
    }

    const [machines, locations] = await Promise.all([
      this.machines.findByOrg(orgId),
      this.locations.findByOrg(orgId),
    ]);
    const machineById = new Map(machines.map((m) => [m.id, m]));
    const locationById = new Map(locations.map((l) => [l.id, l]));

    const productIds = [
      ...new Set(latest.flatMap((v) => v.lines.map((line) => line.productId))),
    ];
    // Deleted-tolerant: a retired product still sitting in a machine is
    // exactly the stock most likely to go bad.
    const stocked = await this.products.findByIdsIncludingDeleted(
      orgId,
      productIds,
    );
    const productById = new Map(stocked.map((p) => [p.id, p]));

    const cutoff = dateAfter(asOf, withinDays);
    const report: ExpiringReport = { ...empty };

    for (const visit of latest) {
      const machine = machineById.get(visit.machineId);
      // A machine retired since its last visit is off the route; its stock is
      // no longer sellable, so it is not something to act on before a trip.
      if (!machine) {
        continue;
      }
      const location = locationById.get(visit.locationId);

      for (const slot of expirationsForVisit(visit)) {
        const product = productById.get(slot.productId);
        if (!product) {
          continue;
        }

        const row: ExpiringSlot = {
          machineId: machine.id,
          machineName: machine.name,
          locationId: visit.locationId,
          locationName: location?.name ?? "Unknown location",
          slotCode: slot.slotCode,
          productId: slot.productId,
          productName: product.name,
          units: slot.units,
          bestBy: slot.bestBy,
          daysUntil: slot.bestBy === null ? null : daysUntil(slot.bestBy, asOf),
        };

        if (slot.bestBy === null) {
          // An untracked product has no gap to report — that null is the
          // answer, not a hole in it.
          if (product.tracksExpiration) {
            report.missingDates.push(row);
          }
          continue;
        }
        // String comparison, not Date parsing: "YYYY-MM-DD" sorts
        // chronologically by construction.
        if (slot.bestBy < asOf) {
          report.expired.push(row);
          continue;
        }
        if (slot.bestBy <= cutoff) {
          report.expiringSoon.push(row);
        }
      }
    }

    const bySoonest = (a: ExpiringSlot, b: ExpiringSlot): number =>
      (a.bestBy ?? "") < (b.bestBy ?? "")
        ? -1
        : (a.bestBy ?? "") > (b.bestBy ?? "")
          ? 1
          : 0;
    report.expired.sort(bySoonest);
    report.expiringSoon.sort(bySoonest);

    return report;
  }
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun run --cwd packages/api test VisitService`
Expected: PASS — 8 new tests plus the existing suite.

- [ ] **Step 6: Expose the tRPC query**

In `packages/api/src/routers/visits.ts`, add `DEFAULT_EXPIRY_WINDOW_DAYS` to the `../services/VisitService/VisitService.ts` import. Then add inside `visitsRouter`, after `pnl`:

```ts
  expiringSoon: orgProtectedProcedure
    .input(
      z.object({
        withinDays: z
          .number()
          .int()
          .min(0)
          .max(365)
          .default(DEFAULT_EXPIRY_WINDOW_DAYS),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.services.visitService.expiringSoon(ctx.auth.orgId, {
        withinDays: input.withinDays,
      }),
    ),
```

`asOf` is deliberately not accepted from a client — the report is about today, and letting a caller pick the day is a way to produce a reassuring report by asking the wrong question.

- [ ] **Step 7: Run the full api suite and typecheck**

Run: `bun run --cwd packages/api test && bun run --cwd packages/api typecheck`
Expected: PASS both.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src
git commit -m "feat(api): add the visits.expiringSoon report"
```

---

### Task 6: Web — `bestBy` in the visit row model

**Files:**
- Modify: `packages/web/src/screens/visits/visitRows.ts`
- Modify: `packages/web/src/screens/visits/visitRows.test.ts`

**Interfaces:**
- Consumes: `levelAfter`, `daysUntil`, `dateAfter` (Task 1)
- Produces: `VisitRow.bestBy: string`, `VisitRow.previousBestBy: string | null`, `VisitRow.tracksExpiration: boolean`; `VisitLineDraft.bestBy: string | null`; `rowWithBestBy(row, bestBy): VisitRow`; `buildVisitRows({ shelves, planogramSlots, previousVisit, products })`; `warningsFor(row, { asOf }): RowWarning[]` with `"expired"` and `"expiring-soon"` added

- [ ] **Step 1: Write the failing tests**

In `visitRows.test.ts`, matching the file's existing `row()` helper conventions:

```ts
describe("bestBy pre-fill", () => {
  it("carries the previous visit's date for a matching slot and product", () => {
    const rows = buildVisitRows({
      shelves: [["B3"]],
      planogramSlots: [
        { slotCode: "B3", productId: "doritos", par: 10, priceCents: 150 },
      ],
      previousVisit: {
        lines: [
          {
            slotCode: "B3",
            productId: "doritos",
            remaining: 4,
            added: 6,
            removed: 0,
            removedReason: null,
            priceCents: 150,
            par: 10,
            bestBy: "2026-12-15",
          },
        ],
      },
      products: [{ id: "doritos", tracksExpiration: true }],
    });
    expect(rows[0].bestBy).toBe("2026-12-15");
    expect(rows[0].previousBestBy).toBe("2026-12-15");
  });

  it("leaves the date blank when the slot has no history", () => {
    const rows = buildVisitRows({
      shelves: [["B3"]],
      planogramSlots: [
        { slotCode: "B3", productId: "doritos", par: 10, priceCents: 150 },
      ],
      previousVisit: null,
      products: [{ id: "doritos", tracksExpiration: true }],
    });
    expect(rows[0].bestBy).toBe("");
    expect(rows[0].previousBestBy).toBeNull();
  });

  it("carries the product's tracking flag onto the row", () => {
    const rows = buildVisitRows({
      shelves: [["B2"]],
      planogramSlots: [
        { slotCode: "B2", productId: "gum", par: 10, priceCents: 150 },
      ],
      previousVisit: null,
      products: [{ id: "gum", tracksExpiration: false }],
    });
    expect(rows[0].tracksExpiration).toBe(false);
  });
});

describe("buildVisitLines bestBy", () => {
  it("sends a typed date through", () => {
    const result = buildVisitLines([
      row({ left: "5", added: "5", bestBy: "2026-12-15" }),
    ]);
    expect(result).toEqual({
      lines: [expect.objectContaining({ bestBy: "2026-12-15" })],
    });
  });

  it("sends a blank date as null, never a guessed value", () => {
    const result = buildVisitLines([row({ left: "5", added: "5", bestBy: "" })]);
    expect(result).toEqual({
      lines: [expect.objectContaining({ bestBy: null })],
    });
  });

  it("rejects a malformed date with a slot-prefixed message", () => {
    const result = buildVisitLines([
      row({ slotCode: "B3", left: "5", added: "5", bestBy: "Dec 15" }),
    ]);
    expect(result).toEqual({
      error: 'Slot B3: "Best by" must be a date like 2026-12-15',
    });
  });

  // A date on a slot with nothing in it describes stock that is not there.
  it("sends null when the slot ends up empty", () => {
    const result = buildVisitLines([
      row({
        left: "2",
        added: "0",
        removed: "2",
        removedReason: "expired",
        bestBy: "2026-10-06",
      }),
    ]);
    expect(result).toEqual({
      lines: [expect.objectContaining({ bestBy: null })],
    });
  });
});

describe("warningsFor expiry", () => {
  const ASOF = "2026-10-17";

  it("flags an expired slot", () => {
    expect(
      warningsFor(row({ left: "3", added: "0", bestBy: "2026-10-06" }), {
        asOf: ASOF,
      }),
    ).toContain("expired");
  });

  it("flags a slot inside the window", () => {
    expect(
      warningsFor(row({ left: "3", added: "0", bestBy: "2026-10-20" }), {
        asOf: ASOF,
      }),
    ).toContain("expiring-soon");
  });

  it("stays quiet beyond the window", () => {
    expect(
      warningsFor(row({ left: "3", added: "0", bestBy: "2026-12-16" }), {
        asOf: ASOF,
      }),
    ).toEqual([]);
  });

  it("stays quiet on an empty slot, nothing in there to go bad", () => {
    expect(
      warningsFor(row({ left: "0", added: "0", bestBy: "2026-10-06" }), {
        asOf: ASOF,
      }),
    ).toEqual([]);
  });

  it("stays quiet with no date recorded", () => {
    expect(
      warningsFor(row({ left: "3", added: "0", bestBy: "" }), { asOf: ASOF }),
    ).toEqual([]);
  });
});
```

Extend the file's existing `row()` helper so it defaults `bestBy: ""`, `previousBestBy: null` and `tracksExpiration: true`, and update the three existing `warningsFor` assertions to pass `{ asOf: "2026-10-17" }`.

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --cwd packages/web test visitRows`
Expected: FAIL — `bestBy` is not a property of `VisitRow`, and `buildVisitRows` takes no `products`.

- [ ] **Step 3: Extend the row and draft types**

In `visitRows.ts`, add `dateAfter` and `daysUntil` to the `@vendpire/domain` import. Add to `interface VisitRow`, after `previousLevel`:

```ts
  /**
   * The front unit's date — the one that SELLS NEXT, not the stock you just
   * loaded behind it. `""` means NOT RECORDED and is sent as null, for the
   * same reason `left: ""` is never coerced to 0: a guessed date in a report
   * whose job is "never sell expired food" is worse than an admitted gap.
   */
  readonly bestBy: string;
  /** Last visit's date for this slot, for the hint. Null with no history. */
  readonly previousBestBy: string | null;
  /** From the product. False hides the field entirely. */
  readonly tracksExpiration: boolean;
```

Add to `interface VisitLineDraft`, after `par`:

```ts
  bestBy: string | null;
```

Add beside `PlanogramSlotLike`:

```ts
/** What the product catalogue contributes to a row. Declared here, not
 *  imported, so this module stays independent of the wire. */
interface ProductLike {
  id: string;
  tracksExpiration: boolean;
}
```

And in `toLine`, after `par: row.par,`:

```ts
  bestBy: null,
```

- [ ] **Step 4: Pre-fill from the previous visit**

In `buildVisitRows`, change the signature to take `products`:

```ts
export const buildVisitRows = ({
  shelves,
  planogramSlots,
  previousVisit,
  products,
}: {
  shelves: readonly string[][];
  planogramSlots: readonly PlanogramSlotLike[];
  previousVisit: PreviousVisitLike | null;
  products: readonly ProductLike[];
}): VisitRow[] => {
```

Add after the `previousByKey` map is built:

```ts
  const tracksExpirationById = new Map(
    products.map((product) => [product.id, product.tracksExpiration]),
  );
```

And inside the `rows.push({...})`, after `previousLevel`:

```ts
      bestBy: previous?.bestBy ?? "",
      previousBestBy: previous?.bestBy ?? null,
      // Defaults to true for a product not in the list: a slot that silently
      // stops asking for a date is the failure this whole feature exists to
      // avoid, so the safe default is to keep asking.
      tracksExpiration: tracksExpirationById.get(slot.productId) ?? true,
```

- [ ] **Step 5: Add the setter**

In `visitRows.ts`, beside `rowWithRemovedReason`:

```ts
/** No `isEdited` latch, unlike `added`: nothing recomputes this, so there is
 *  no default to retire. */
export const rowWithBestBy = (row: VisitRow, bestBy: string): VisitRow => ({
  ...row,
  bestBy,
});
```

- [ ] **Step 6: Validate and emit the date**

In `visitRows.ts`, near the top beside `parseCount`:

```ts
/** The one accepted spelling. Rejects an ISO instant, which drags a zone in,
 *  and a non-padded date, which breaks lexicographic ordering. */
const CALENDAR_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Matches the server's default window, so the slot row and the pre-trip
 *  report cannot disagree about what "soon" means. */
const EXPIRY_WINDOW_DAYS = 14;
```

Inside `buildVisitLines`, after the removed-reason check and before `lines.push`:

```ts
    const bestBy = row.bestBy.trim();
    if (bestBy !== "" && !CALENDAR_DATE.test(bestBy)) {
      return {
        error: `Slot ${row.slotCode}: "Best by" must be a date like 2026-12-15`,
      };
    }
```

Then inside the `lines.push({...})`, after the `removedReason` line:

```ts
      // A date on a slot with nothing in it describes stock that is not there
      // — leftover UI state, not a fact. Same rule as the reason above.
      bestBy:
        bestBy === "" || remaining - removed + added === 0 ? null : bestBy,
```

- [ ] **Step 7: Add the expiry warnings**

In `visitRows.ts`, widen the warning union:

```ts
export type RowWarning =
  | "over-par"
  | "over-removed"
  | "expired"
  | "expiring-soon";
```

Change `warningsFor` to take the day:

```ts
export const warningsFor = (
  row: VisitRow,
  { asOf }: { asOf: string },
): RowWarning[] => {
```

And append this just before its `return warnings;`:

```ts
  // Against the level AFTER the fill: an emptied slot has nothing left to go
  // bad, however old the date on screen is.
  const bestBy = row.bestBy.trim();
  if (bestBy !== "" && CALENDAR_DATE.test(bestBy) && (level ?? 0) > 0) {
    const days = daysUntil(bestBy, asOf);
    if (days < 0) {
      warnings.push("expired");
    } else if (bestBy <= dateAfter(asOf, EXPIRY_WINDOW_DAYS)) {
      warnings.push("expiring-soon");
    }
  }
```

`level` is the existing `levelOf(row)` local already computed in that function for the over-par check — reuse it rather than recomputing.

- [ ] **Step 8: Run to verify it passes**

Run: `bun run --cwd packages/web test visitRows`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/screens/visits/visitRows.ts packages/web/src/screens/visits/visitRows.test.ts
git commit -m "feat(web): add bestBy to the visit row model"
```

---

### Task 7: Web — the date field on the visit entry screen

**Files:**
- Modify: `packages/web/src/screens/visits/VisitEntryScreen.tsx`

**Interfaces:**
- Consumes: `rowWithBestBy`, `warningsFor(row, { asOf })`, `VisitRow.bestBy / previousBestBy / tracksExpiration` (Task 6); the existing `products` query already on this screen

- [ ] **Step 1: Feed the products into the row build**

In `VisitEntryScreen.tsx`, the `useEffect` that calls `buildVisitRows` must now wait for products, which the screen already queries at `:92`. Extend the existing guard:

```ts
    if (!previousVisits.isSuccess || !products.isSuccess) {
      return;
    }
```

Pass them in:

```ts
    const built = buildVisitRows({
      shelves: machine.data.slots,
      planogramSlots: planogram.data?.slots ?? [],
      previousVisit: previousVisits.data[0] ?? null,
      products: products.data,
    });
```

And add `products.isSuccess` and `products.data` to the effect's dependency array. The "built ONCE" guard (`isBuilt`) still protects typed-in counts from a refetch — do not remove it.

- [ ] **Step 2: Compute today once, at the top of `VisitDraftForm`**

```ts
  // The day the warnings are judged against. Fixed at form open so a visit
  // spanning midnight cannot reclassify rows mid-count.
  const [asOf] = useState(() => new Date().toISOString().slice(0, 10));
```

- [ ] **Step 3: Pass it to both `warningsFor` call sites**

At `VisitEntryScreen.tsx:200` (the face cell) and `:398` (the detail panel), change `warningsFor(row)` to `warningsFor(row, { asOf })`. Thread `asOf` down as a prop if the cell renderer does not already have it in scope.

- [ ] **Step 4: Render the field**

In the slot detail panel, directly after the closing `</div>` of the `grid-cols-2` block holding "Left in slot" and "Added", and before the `{isRemoving ? (` block:

```tsx
      {row.tracksExpiration ? (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Best by</span>
          <input
            type="date"
            className={inputClass}
            value={row.bestBy}
            onChange={(e) => onChange(rowWithBestBy(row, e.target.value))}
          />
          <span className={hintClass}>
            {row.previousBestBy === null
              ? "The front item — the one that sells next"
              : `Last visit: ${row.previousBestBy}`}
          </span>
        </label>
      ) : null}
```

`type="date"` emits `"YYYY-MM-DD"` natively, which is exactly the stored spelling — no formatting layer, and a mobile browser gives a date picker. The hint states the field's meaning, which is the one thing a user can get wrong in a way nothing downstream detects: it is the **front** item's date, not the stock just loaded behind it.

- [ ] **Step 5: Show the warnings on the row and the face**

Extend the existing warning rendering near `:499` with the two new kinds:

```tsx
            warnings.includes("expired")
              ? "Past its best-by date — pull it"
              : warnings.includes("expiring-soon")
                ? "Expiring soon"
                : warnings.includes("over-removed")
```

The face cell at `:200` already maps warnings to `state: "attention"`, so expiry joins that path with no change to `SlotFaceGrid` — the grid owns chrome and takes state from its consumer.

- [ ] **Step 6: Typecheck, lint and test**

Run: `bun run --cwd packages/web typecheck && bun run --cwd packages/web test && bun run lint`
Expected: PASS all three.

- [ ] **Step 7: Verify in the running app**

Run `bun run dev`, open a machine's visit entry screen, and confirm:
- a slot with history shows a pre-filled date and "Last visit: ..."
- a slot with no history shows a blank date and the "front item" hint
- a product with `tracksExpiration: false` shows no date field
- a past date turns the face cell amber and shows "Past its best-by date — pull it"

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/screens/visits/VisitEntryScreen.tsx
git commit -m "feat(web): capture the best-by date on the visit entry screen"
```

---

### Task 8: Web — the `tracksExpiration` checkbox on the product form

**Files:**
- Modify: `packages/web/src/screens/products/ProductFormScreen.tsx`

**Interfaces:**
- Consumes: `products.create` / `products.update` accepting `tracksExpiration` (Task 4)

- [ ] **Step 1: Add the field to the form state**

In `ProductFormScreen.tsx`, add `tracksExpiration: boolean;` to the form state interface at `:16` (beside `active`), `tracksExpiration: true,` to the initial state at `:26`, `tracksExpiration: product.tracksExpiration,` to the load-from-product mapping at `:52`, and `tracksExpiration: form.tracksExpiration,` to the submit payload at `:121`.

- [ ] **Step 2: Render the checkbox**

Directly after the existing `active` checkbox block at `:219-223`, copying that block's exact className values so the two controls look identical:

```tsx
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.tracksExpiration}
            onChange={(e) => set({ tracksExpiration: e.target.checked })}
          />
          <span className="text-sm text-body">Track expiration dates</span>
        </label>
        <p className="text-xs text-gray-500">
          On for anything with a printed best-by date. Turn it off for gum,
          bulk candy, and non-food — slot rows then stop asking for a date.
        </p>
```

- [ ] **Step 3: Typecheck, lint and verify**

Run: `bun run --cwd packages/web typecheck && bun run lint`
Expected: PASS both.

Then with `bun run dev`: create a product with the box unticked, open a visit entry screen for a machine stocking it, and confirm that slot shows no date field.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/screens/products/ProductFormScreen.tsx
git commit -m "feat(web): add the expiration tracking toggle to the product form"
```

---

### Task 9: Web — the expiring-soon dashboard card

**Files:**
- Modify: `packages/web/src/screens/dashboard/DashboardScreen.tsx`
- Create: `packages/web/src/screens/dashboard/ExpiringSoonCard.tsx`

**Interfaces:**
- Consumes: the `visits.expiringSoon` query (Task 5)

**Why a separate file:** `DashboardScreen` is currently a 33-line Phase 1 placeholder. Putting the card in its own file keeps the screen a composition point as more cards arrive, rather than growing one file that does everything.

- [ ] **Step 1: Write the card**

Create `packages/web/src/screens/dashboard/ExpiringSoonCard.tsx`. `Card` is a named export from `packages/web/src/ui/Card.tsx` taking `children`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../ui/Card.tsx";
import { trpc } from "../../trpc.ts";

/**
 * What to load before the next trip. Reads the latest visit per machine, so it
 * is only ever as current as the last time each machine was counted — which is
 * the right answer: stock only gets older between visits.
 */
export function ExpiringSoonCard() {
  const report = useQuery(trpc.visits.expiringSoon.queryOptions({}));

  if (report.isLoading) {
    return (
      <Card>
        <p className="text-gray-500">Checking what&apos;s expiring...</p>
      </Card>
    );
  }
  if (report.isError) {
    return (
      <Card>
        <p className="text-red-600">
          Couldn&apos;t load the expiry report: {report.error.message}
        </p>
      </Card>
    );
  }

  const data = report.data;
  if (!data) {
    return null;
  }
  const actionable = [...data.expired, ...data.expiringSoon];

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium text-body">Expiring soon</h2>
        <span className="text-xs text-gray-500">
          next {data.withinDays} days
        </span>
      </div>

      {actionable.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">
          Nothing expiring in the next {data.withinDays} days.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {actionable.map((slot) => (
            <li
              key={`${slot.machineId} ${slot.slotCode} ${slot.productId}`}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="truncate">
                <span className="font-mono text-xs text-gray-500">
                  {slot.slotCode}
                </span>{" "}
                <span className="text-body">{slot.productName}</span>{" "}
                <span className="text-gray-500">
                  · {slot.locationName} / {slot.machineName}
                </span>
              </span>
              <span
                className={
                  slot.daysUntil !== null && slot.daysUntil < 0
                    ? "shrink-0 font-medium text-red-600"
                    : "shrink-0 text-amber-700"
                }
              >
                {slot.units} ·{" "}
                {slot.daysUntil !== null && slot.daysUntil < 0
                  ? `EXPIRED ${slot.bestBy}`
                  : `${slot.bestBy} · ${slot.daysUntil}d`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Rendered even when both lists above are empty — that combination is
          precisely the one that would otherwise read as "all clear". */}
      {data.missingDates.length > 0 ? (
        <p className="mt-3 border-line border-t pt-2 text-xs text-gray-500">
          No date on file for {data.missingDates.length} stocked slot
          {data.missingDates.length === 1 ? "" : "s"} — they aren&apos;t
          counted above.
        </p>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 2: Mount it on the dashboard**

In `DashboardScreen.tsx`, import the card and render it below the existing org paragraph:

```tsx
      <div className="mt-6">
        <ExpiringSoonCard />
      </div>
```

- [ ] **Step 3: Typecheck, lint and test**

Run: `bun run --cwd packages/web typecheck && bun run --cwd packages/web test && bun run lint`
Expected: PASS all three.

- [ ] **Step 4: Verify end to end**

With `bun run dev`:
1. Record a visit with a slot dated in the past and another dated five days out.
2. Open the dashboard — both appear, the past one in red marked EXPIRED, ordered soonest first.
3. Record a visit leaving a tracked slot's date blank — the "no date on file" line appears.
4. Empty a slot completely (`left` = n, `removed` = n, `added` = 0) — it drops off the card.

- [ ] **Step 5: Run every check and commit**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: PASS all three, across every package.

```bash
git add packages/web/src/screens/dashboard
git commit -m "feat(web): add the expiring-soon dashboard card"
```

---

### Task 10: End-to-end — a dated visit reaches the report

**Files:**
- Modify: `packages/e2e/tests/visits.spec.ts`

**Interfaces:**
- Consumes: `visits.create` accepting `bestBy` (Task 4) and the `visits.expiringSoon` query (Task 5)

**Why here rather than a new file:** `visits.spec.ts` already calls `requireTestUser()` and defines the `mutate` / `query` / `dataOf` helpers this test needs. A second file would duplicate all of it. Like every browser-touching spec, this one skips unless the Clerk test-user env vars are set.

- [ ] **Step 1: Add the spec**

Append to `packages/e2e/tests/visits.spec.ts`, reusing the `mutate`, `query` and `dataOf` helpers already defined at the top of the file and copying the fixture destructuring and sign-in sequence from the existing `"a repeated submit of one draft stores exactly one visit"` test at `:59`:

```ts
/**
 * The expiry report's one job is to be trusted, so this proves the whole path
 * a date travels: typed at a machine, stored, and read back as something to
 * act on before the next trip. The service test proves the bucketing; only
 * this proves the wire carries `bestBy` at all.
 */
test("a visit's best-by date comes back on the expiry report", async ({
  apiUrl,
  token,
  seededMachine,
}) => {
  // Dated in the past, so it lands in `expired` regardless of when the suite
  // runs — a date relative to "today" would make this test age out.
  await mutate(apiUrl, token, "visits.create", {
    machineId: seededMachine.id,
    locationId: seededMachine.locationId,
    planogramId: null,
    countedAt: new Date().toISOString(),
    lines: [
      {
        slotCode: seededMachine.slotCode,
        productId: seededMachine.productId,
        remaining: 0,
        added: 4,
        removed: 0,
        removedReason: null,
        priceCents: 150,
        par: 4,
        bestBy: "2020-01-15",
      },
    ],
    notes: null,
    clientRequestId: crypto.randomUUID(),
  });

  const report = await dataOf<{
    expired: { slotCode: string; units: number; bestBy: string }[];
    missingDates: unknown[];
  }>(await query(apiUrl, token, "visits.expiringSoon", { withinDays: 14 }));

  const row = report.expired.find(
    (slot) => slot.slotCode === seededMachine.slotCode,
  );
  expect(row).toBeDefined();
  expect(row?.bestBy).toBe("2020-01-15");
  expect(row?.units).toBe(4);
});
```

Replace `seededMachine` with whatever the existing test uses to get a machine, location, slot code and product id — read `:59` onward and mirror it exactly rather than assuming a fixture by that name exists.

- [ ] **Step 2: Run the spec**

Run: `bun run test:e2e`
Expected: PASS, or SKIP if `E2E_CLERK_USER_EMAIL` / `E2E_CLERK_USER_PASSWORD` are unset. A skip is an acceptable local result; the test still has to pass where those keys are configured.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/visits.spec.ts
git commit -m "test(e2e): cover a dated visit reaching the expiry report"
```

---

## Verification

After Task 9, the whole feature is exercised by:

```bash
bun run typecheck && bun run lint && bun run test
```

Plus `bun run test:e2e` for Task 10, which skips without Clerk test-user keys.

And by hand: record a visit with dates, see the slot warnings at capture time, see the dashboard card before the next trip.

## Out of scope

- **iOS.** `ios/Vendpire/Store/Model/MirroredEntities.swift` mirrors visits, but there is no fill screen yet. `bestBy` joins the mirror when that screen is built, against the contract this plan establishes.
- **A configurable per-org warning window.** Fixed at 14 days in both `DEFAULT_EXPIRY_WINDOW_DAYS` (server) and `EXPIRY_WINDOW_DAYS` (`visitRows.ts`); the comment on each points at the other.
- **Dated add-lines.** The planned upgrade, with its revisit trigger recorded in the spec. Nothing in this plan has to be unbuilt to get there.
