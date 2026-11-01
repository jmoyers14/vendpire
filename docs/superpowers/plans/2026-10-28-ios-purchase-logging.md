# iOS Purchase Logging + Scanner (Phase 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log a stock-buying run on the phone: VisionKit scanning resolved against the local mirror, attach-or-create for unknown codes over new flat REST endpoints, submission through the Phase 8 outbox into the unchanged `PurchaseService`.

**Architecture:** Backend work is thin exposure in `packages/api` (a `candidates` router, OpenAPI meta on existing create mutations, two narrow `attachBarcode` service methods). iOS work is additive: a `PurchaseSubmission` payload + outbox producer, a `kind` switch at the one network edge, single-record mirror upserts, and a new `PurchaseLog` feature (scanner, not-found sheet, receipt rows). Money math is never reimplemented — except the display-only `allocateProportionally` port, pinned by shared vectors.

**Tech Stack:** Bun + tRPC + `trpc-to-openapi` + zod (api), SwiftUI + SwiftData + VisionKit + swift-openapi-generator (ios), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-10-28-ios-purchase-logging-design.md` — read it before starting any task.

## Global Constraints

- Verification commands: `bun run typecheck` · `bun run lint` · `bun run test` (root). iOS: `bun run ios:build`, `bun run ios:test`.
- **iOS tests must run on a physically attached device** — `Scripts/xc` resolves one automatically; the Simulator aborts 10 tests and still reports green. Never trust a Simulator test result.
- `DEVELOPER_DIR` is pinned by `Scripts/xc` to Xcode 26.1; don't fight it.
- The Xcode project uses synchronized folders: **creating a Swift file under `ios/Vendpire/` or `ios/VendpireTests/` auto-includes it. Never edit `project.pbxproj`.**
- Regenerate the committed OpenAPI doc with `bun run --cwd packages/api openapi` after ANY router meta/schema change; `buildOpenApiDocument.test.ts` fails CI on a stale `openapi/vendpire.yaml`.
- Verify generated YAML by parsing, never by grepping (YAML aliases lie to grep).
- The schema-annotation pattern is `Assert<Equal<z.infer<typeof dto>, Entity>>` from `schemas/exactly.ts` — NOT `z.ZodType<T>`.
- Money is integer cents everywhere. The phone submits `lines` + `packLines` and never splits a cost; `PurchaseServiceImpl.expandPackLines` stays the only place money is divided. The Swift `Allocate` port is for the on-screen preview only.
- Any new `@Model` must be added to `VendpireStore.schema` — this plan adds none.
- Follow `CLAUDE.md` naming conventions (catalog = the org's own set; candidate = an unverified external identification).
- Commit style: `feat(api):` / `feat(ios):` / `docs:` etc., matching `git log`.

---

# Part A — Backend

### Task 1: The `candidates` router (rename, web call sites follow)

The external-catalog procedures stop living under `products` with "catalog" in their names. Pure relocation — same service calls, same behavior.

**Files:**
- Create: `packages/api/src/routers/candidates.ts`
- Modify: `packages/api/src/routers/products.ts` (delete `searchCatalog` + `lookupUpc`, lines 40–52)
- Modify: `packages/api/src/router.ts` (register `candidates`)
- Modify: `packages/web/src/screens/products/CatalogSearch.tsx:51`
- Modify: `packages/web/src/screens/products/ProductFormScreen.tsx:81`

**Interfaces:**
- Consumes: `ctx.services.productDataService.lookup(upc): Promise<ProductData | null>`, `.search(query): Promise<ProductSearchResult[]>` (already in `Context["services"]`).
- Produces: tRPC procedures `candidates.byUpc` (input `{ code: string }`) and `candidates.search` (input `{ query: string }`). Task 2 adds OpenAPI meta to `byUpc`.

- [ ] **Step 1: Create the router**

```ts
// packages/api/src/routers/candidates.ts
import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

// A candidate is what an outside database (Open Food Facts) says a barcode
// might name — prefill-only, never a fact about the org's catalog. The org's
// own records are "the catalog"; these are not it.
export const candidatesRouter = router({
  // External lookup for one code — returns name/brand/image, or null.
  byUpc: orgProtectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.productDataService.lookup(input.code),
    ),

  // External text search — returns ranked matches with barcodes.
  search: orgProtectedProcedure
    .input(z.object({ query: z.string() }))
    .query(({ ctx, input }) =>
      ctx.services.productDataService.search(input.query),
    ),
});
```

- [ ] **Step 2: Register it and delete the old procedures**

In `packages/api/src/router.ts` add `import { candidatesRouter } from "./routers/candidates.ts";` and the key `candidates: candidatesRouter,` (alphabetical with the others). In `products.ts` delete the `searchCatalog` and `lookupUpc` procedures (and the now-unused comment lines above each).

- [ ] **Step 3: Update the two web call sites**

`packages/web/src/screens/products/CatalogSearch.tsx:51`:
```ts
const found = await trpcClient.candidates.search.query({ query: trimmed });
```
`packages/web/src/screens/products/ProductFormScreen.tsx:81`:
```ts
const found = await trpcClient.candidates.byUpc.query({ code: form.upc.trim() });
```

- [ ] **Step 4: Verify**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: all pass — typecheck is the real gate here (a missed call site is a compile error).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/candidates.ts packages/api/src/routers/products.ts packages/api/src/router.ts packages/web/src/screens/products/
git commit -m "refactor(api): external catalog results are candidates, not catalog"
```

---

### Task 2: `GET /api/v1/barcode-candidate` + the `candidateDto`

**Files:**
- Create: `packages/api/src/schemas/candidate.ts`
- Modify: `packages/api/src/schemas/index.ts`
- Modify: `packages/api/src/routers/candidates.ts` (meta + output on `byUpc`)
- Modify: `packages/api/src/openapi/buildOpenApiDocument.test.ts`
- Regenerate: `openapi/vendpire.yaml`

**Interfaces:**
- Produces: `candidateDto` (zod, `.meta({ id: "Candidate" })`), REST operation `getBarcodeCandidate` at `GET /barcode-candidate?code=…` returning `Candidate | null`. The iOS client (Task 11) consumes this operation from the regenerated spec.

- [ ] **Step 1: Write the failing openapi tests**

In `buildOpenApiDocument.test.ts`: add `"/barcode-candidate"` to the expected-paths assertion (the sorted list currently holds the ten paths `/client-support, /locations, /machines, /me, /packs, /planograms/current, /products, /purchases, /visits, /visits/latest`), add `"Candidate"` to the named-components assertion, and add:

```ts
it("serves the barcode candidate as a flat nullable object — no oneOf", () => {
  const document = parse(readFileSync(COMMITTED, "utf8"));
  const candidate = document.components.schemas.Candidate;
  expect(candidate.type).toBe("object");
  expect(Object.keys(candidate.properties).sort()).toEqual(["brand", "imageUrl", "name"]);
  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(candidate);
  expect(validate({ name: "Coke Zero 12oz", brand: "Coca-Cola", imageUrl: null })).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run --cwd packages/api test openapi`
Expected: FAIL — `/barcode-candidate` missing from paths, `Candidate` component missing.

- [ ] **Step 3: Implement the schema and meta**

```ts
// packages/api/src/schemas/candidate.ts
import { z } from "zod";
import type { ProductData } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

// What an outside database says a barcode might be. Every field can be null —
// the provider often has partial data — and the whole thing is null when the
// code is unrecognized.
export const candidateDto = z
  .object({
    name: z.string().nullable(),
    brand: z.string().nullable(),
    imageUrl: z.string().nullable(),
  })
  .meta({ id: "Candidate" });

export type CandidateDtoMatches = Assert<Equal<z.infer<typeof candidateDto>, ProductData>>;
```

Re-export `candidateDto` from `schemas/index.ts`. Then in `candidates.ts`, give `byUpc` the meta (model: `purchases.create` at `routers/purchases.ts:75`):

```ts
  byUpc: orgProtectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/barcode-candidate",
        tags: ["candidates"],
        protect: true,
        operationId: "getBarcodeCandidate",
        summary: "What an outside database says a barcode might name",
        errorResponses: {
          401: "Authorization not provided",
          403: "Insufficient access",
          426: "This build is below the supported floor; the client must update.",
          500: "Internal server error",
        },
      },
    })
    .input(z.object({ code: z.string().min(1) }))
    .output(candidateDto.nullable())
    .query(({ ctx, input }) =>
      ctx.services.productDataService.lookup(input.code),
    ),
```

- [ ] **Step 4: Regenerate and verify**

Run: `bun run --cwd packages/api openapi && bun run test && bun run typecheck`
Expected: PASS. If the nullable output renders as `anyOf`, the override hook in `buildOpenApiDocument.ts` is the place to look — do not remove its existing workarounds.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/schemas/ packages/api/src/routers/candidates.ts packages/api/src/openapi/ openapi/vendpire.yaml
git commit -m "feat(api): GET /api/v1/barcode-candidate for the iOS scanner"
```

---

### Task 3: Expose `POST /products` and `POST /packs`

**Files:**
- Modify: `packages/api/src/routers/products.ts` (`create`, ~line 60)
- Modify: `packages/api/src/routers/packs.ts` (`create`, ~line 49)
- Modify: `packages/api/src/openapi/buildOpenApiDocument.test.ts`
- Regenerate: `openapi/vendpire.yaml`

**Interfaces:**
- Produces: REST operations `createProduct` (`POST /products`) and `createPack` (`POST /packs`), each returning the existing `Product`/`Pack` component. Consumed by iOS in Task 11.

- [ ] **Step 1: Write the failing test**

In `buildOpenApiDocument.test.ts` add:

```ts
it("creates products and packs over REST — the scanner's create path", () => {
  const document = parse(readFileSync(COMMITTED, "utf8"));
  expect(document.paths["/products"].post.operationId).toBe("createProduct");
  expect(document.paths["/packs"].post.operationId).toBe("createPack");
  expect(document.paths["/products"].post.security).toEqual([{ bearer: [] }]);
  expect(document.paths["/packs"].post.security).toEqual([{ bearer: [] }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --cwd packages/api test openapi`
Expected: FAIL — no `post` key on either path.

- [ ] **Step 3: Add meta + output to both create mutations**

`products.create` (packs mirror it with `path: "/packs"`, `operationId: "createPack"`, tags `["packs"]`, `.output(packDto)`, summary `"Create a way of buying — a case with its own barcodes"`):

```ts
  create: orgProtectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/products",
        tags: ["products"],
        protect: true,
        operationId: "createProduct",
        summary: "Create a sellable unit",
        errorResponses: {
          400: "Invalid input data",
          401: "Authorization not provided",
          403: "Insufficient access",
          409: "The barcode already belongs to another record",
          426: "This build is below the supported floor; the client must update.",
          500: "Internal server error",
        },
      },
    })
    .input(productInput)
    .output(productDto)
    .mutation(async ({ ctx, input }) => { /* body unchanged */ }),
```

Keep the existing analytics capture in the body untouched. Import `packDto` in `packs.ts` if not already imported.

- [ ] **Step 4: Regenerate and verify**

Run: `bun run --cwd packages/api openapi && bun run test && bun run typecheck`
Expected: PASS, including the distinct-error-descriptions test (409 is a new status — if the relabel hook trips on it, clone-and-relabel there as the existing 426/500 workaround does).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/ packages/api/src/openapi/ openapi/vendpire.yaml
git commit -m "feat(api): POST /api/v1/products and /packs for scanner-side creation"
```

---

### Task 4: `attachBarcode` on ProductService and PackService

The narrow server-side attach: load the record fresh, change only the code, reuse the full `validate()` (normalization + org-wide uniqueness). A stale phone mirror can never revert a concurrent web edit, because the phone never sends the other fields.

**Files:**
- Modify: `packages/api/src/services/ProductService/ProductService.ts`, `ProductServiceImpl.ts`
- Modify: `packages/api/src/services/PackService/PackService.ts`, `PackServiceImpl.ts`
- Test: `packages/api/src/services/ProductService/ProductServiceImpl.test.ts`, `.../PackService/PackServiceImpl.test.ts`

**Interfaces:**
- Produces: `attachBarcode(orgId: string, id: string, code: string): Promise<Product>` on `ProductService`; same shape returning `Promise<Pack>` on `PackService`. Task 5's routers call these.

- [ ] **Step 1: Write the failing tests**

Follow the existing fake-based style (`new FakeProductRepository()` etc., positional ctor args). In `ProductServiceImpl.test.ts`:

```ts
describe("attachBarcode", () => {
  it("sets the normalized upc and keeps every other field", async () => {
    const created = products.seed(ORG, productInput({ name: "Coke Zero", upc: null }));
    const updated = await service.attachBarcode(ORG, created.id, "049000042559");
    expect(updated.upc).toBe("00049000042559");
    expect(updated.name).toBe("Coke Zero");
  });

  it("rejects a code already on another product, naming it", async () => {
    products.seed(ORG, productInput({ name: "Sprite", upc: "00049000042559" }));
    const target = products.seed(ORG, productInput({ name: "Coke Zero", upc: null }));
    await expect(service.attachBarcode(ORG, target.id, "049000042559"))
      .rejects.toThrow('already on "Sprite"');
  });

  it("rejects an invalid code", async () => {
    const created = products.seed(ORG, productInput({ upc: null }));
    await expect(service.attachBarcode(ORG, created.id, "12345"))
      .rejects.toThrow("Invalid barcode");
  });

  it("404s on an unknown product", async () => {
    await expect(service.attachBarcode(ORG, "0".repeat(24), "049000042559"))
      .rejects.toThrow("Product not found");
  });
});
```

In `PackServiceImpl.test.ts` (use the local `input()` builder already in that file):

```ts
describe("attachBarcode", () => {
  it("appends the normalized code to barcodes", async () => {
    const productId = products.seed(ORG, productInput({})).id;
    const pack = await service.create(ORG, input({ contents: [{ productId, units: 30 }] }));
    const updated = await service.attachBarcode(ORG, pack.id, "10049000042556");
    expect(updated.barcodes).toContain("10049000042556");
    expect(updated.barcodes.length).toBe(pack.barcodes.length + 1);
  });

  it("rejects a code that is a product's unit code", async () => {
    products.seed(ORG, productInput({ name: "Coke Zero", upc: "00049000042559" }));
    const productId = products.seed(ORG, productInput({ upc: null })).id;
    const pack = await service.create(ORG, input({ contents: [{ productId, units: 30 }] }));
    await expect(service.attachBarcode(ORG, pack.id, "049000042559"))
      .rejects.toThrow('unit code of "Coke Zero"');
  });

  it("404s on an unknown pack", async () => {
    await expect(service.attachBarcode(ORG, "0".repeat(24), "10049000042556"))
      .rejects.toThrow("Pack not found");
  });
});
```

(Check digits: `049000042559` is a valid UPC-A; `10049000042556` a valid GTIN-14. If an assert fails on the check digit, recompute with `Gtin` vectors in `packages/domain/src/gtin/vectors.json`.)

- [ ] **Step 2: Run to verify they fail**

Run: `bun run --cwd packages/api test ProductServiceImpl && bun run --cwd packages/api test PackServiceImpl`
Expected: FAIL — `attachBarcode is not a function`.

- [ ] **Step 3: Implement**

Add to both interfaces, then in `ProductServiceImpl`:

```ts
  /**
   * Attach a scanned unit code to an existing product, touching nothing else.
   * Server-side so a stale client mirror can't clobber concurrent edits; the
   * code goes through the same validate() as create/update.
   */
  async attachBarcode(orgId: string, id: string, code: string): Promise<Product> {
    const product = await this.get(orgId, id);
    if (!product) {
      throw new ServiceError("NOT_FOUND", "Product not found");
    }
    return this.update(orgId, id, {
      name: product.name,
      upc: code,
      category: product.category,
      taxClass: product.taxClass,
      imageUrl: product.imageUrl,
      defaultPriceCents: product.defaultPriceCents,
      active: product.active,
      tracksExpiration: product.tracksExpiration,
    });
  }
```

In `PackServiceImpl` (validate() already dedupes and normalizes the array):

```ts
  async attachBarcode(orgId: string, id: string, code: string): Promise<Pack> {
    const pack = await this.get(orgId, id);
    if (!pack) {
      throw new ServiceError("NOT_FOUND", "Pack not found");
    }
    return this.update(orgId, id, {
      name: pack.name,
      barcodes: [...pack.barcodes, code],
      contents: pack.contents.map(({ productId, units }) => ({ productId, units })),
      active: pack.active,
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run --cwd packages/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/
git commit -m "feat(api): narrow attachBarcode on product and pack services"
```

---

### Task 5: Attach routes — `PUT /products/{id}/barcode`, `PUT /packs/{id}/barcode`

**Files:**
- Modify: `packages/api/src/routers/products.ts`, `packages/api/src/routers/packs.ts`
- Modify: `packages/api/src/openapi/buildOpenApiDocument.test.ts`
- Regenerate: `openapi/vendpire.yaml`

**Interfaces:**
- Consumes: Task 4's `attachBarcode` service methods.
- Produces: REST operations `attachProductBarcode` / `attachPackBarcode` — `id` rides the path, body is `{ code }`. Consumed by iOS in Task 11.

- [ ] **Step 1: Write the failing test**

```ts
it("attaches barcodes through narrow PUT routes", () => {
  const document = parse(readFileSync(COMMITTED, "utf8"));
  expect(document.paths["/products/{id}/barcode"].put.operationId).toBe("attachProductBarcode");
  expect(document.paths["/packs/{id}/barcode"].put.operationId).toBe("attachPackBarcode");
});
```

Also add both paths to the expected-paths list (now thirteen entries, sorted).

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --cwd packages/api test openapi` — Expected: FAIL.

- [ ] **Step 3: Implement both procedures**

In `products.ts` (packs mirror with `path: "/packs/{id}/barcode"`, `operationId: "attachPackBarcode"`, `packService`, `.output(packDto)`):

```ts
  // trpc-to-openapi maps the `id` input field onto the {id} path parameter.
  attachBarcode: orgProtectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/products/{id}/barcode",
        tags: ["products"],
        protect: true,
        operationId: "attachProductBarcode",
        summary: "Attach a scanned unit barcode to an existing product",
        errorResponses: {
          400: "Invalid input data",
          401: "Authorization not provided",
          403: "Insufficient access",
          404: "No such product",
          409: "The barcode already belongs to another record",
          426: "This build is below the supported floor; the client must update.",
          500: "Internal server error",
        },
      },
    })
    .input(z.object({ id: objectId(), code: z.string().min(1) }))
    .output(productDto)
    .mutation(({ ctx, input }) =>
      ctx.services.productService.attachBarcode(ctx.auth.orgId, input.id, input.code),
    ),
```

- [ ] **Step 4: Regenerate and verify**

Run: `bun run --cwd packages/api openapi && bun run test && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/ packages/api/src/openapi/ openapi/vendpire.yaml
git commit -m "feat(api): attach-barcode routes for the iOS scanner"
```

---

### Task 6: E2E — purchase idempotency over REST

**Files:**
- Create: `packages/e2e/tests/purchases.spec.ts`

**Interfaces:**
- Consumes: the live `/api/v1/purchases` route and the `signIn`/`mutate` patterns from `packages/e2e/tests/visits.spec.ts` (copy them — helpers are local per spec by convention).

- [ ] **Step 1: Write the test**

Model on `visits.spec.ts`: copy its `requireTestUser()` call, `signIn`, `mutate`, `dataOf` helpers verbatim, then:

```ts
test("a repeated purchase submit stores exactly one purchase", async ({ page, apiStack }) => {
  const token = await signIn(page, apiStack.apiUrl);
  const product = dataOf<{ id: string }>(
    await mutate(apiStack.apiUrl, token, "products.create", {
      name: `E2E Cola ${crypto.randomUUID().slice(0, 8)}`,
      category: "drinks",
      defaultPriceCents: 175,
    }),
  );

  const body = JSON.stringify({
    purchasedAt: new Date().toISOString(),
    vendor: "E2E Mart",
    lines: [{ productId: product.id, units: 24, totalCostCents: 1299 }],
    clientRequestId: `e2e-${crypto.randomUUID()}`,
  });
  const post = () =>
    fetch(`${apiStack.apiUrl}/api/v1/purchases`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body,
    });

  const first = await post();
  expect(first.status).toBe(200);
  const firstPurchase = await first.json();

  const retry = await post();
  expect(retry.status).toBe(200);
  const retried = await retry.json();
  expect(retried.id).toBe(firstPurchase.id);
});
```

(Confirm the REST mount prefix against `rest.spec.ts` — it targets `/api/v1/...` on the same `apiStack.apiUrl`. The Clerk token has a 60s TTL; the two POSTs are adjacent so one token suffices.)

- [ ] **Step 2: Run it**

Run: `bun run test:e2e -- purchases`
Expected: PASS (or SKIP if Clerk env vars are absent locally — then verify in CI).

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/purchases.spec.ts
git commit -m "test(e2e): purchase idempotency over the REST surface"
```

---

# Part B — The shared allocator

### Task 7: Allocation vectors, pinned from the TypeScript side

Same contract `normalizeGtin` set: a hand-written JSON both implementations must pass.

**Files:**
- Create: `packages/domain/src/money/vectors.json`
- Modify: `packages/domain/src/money/allocate.test.ts` (vector-driven cases)

**Interfaces:**
- Produces: `vectors.json` with shape `{ comment: string, allocate: [{ totalCents, weights, expected, note }] }`. Task 8's Swift tests consume it via symlink.

- [ ] **Step 1: Author the vectors**

Compute `expected` by RUNNING the real implementation — do not hand-derive largest-remainder results:

```bash
bun -e 'import { allocateProportionally as a } from "./packages/domain/src/index.ts";
for (const [t, w] of [[1699,[10,10,10]],[3798,[20,10]],[1000,[1,1,1]],[0,[3,2]],[500,[0,0]],[101,[1,1,1,1,1,1,1]],[2599,[12,18,6]]]) console.log(t, JSON.stringify(w), JSON.stringify(a(t, w)));'
```

Write `packages/domain/src/money/vectors.json` with those outputs:

```json
{
  "comment": "Shared allocation vectors. Read by allocate.test.ts and by ios/VendpireTests/AllocateTests.swift (as the bundle resource allocate-vectors.json, a symlink to this file). The TS implementation is the reference: expected values were produced by running it. Both implementations must pass every case — that is what lets the iOS preview show the numbers the server will store.",
  "allocate": [
    { "totalCents": 1699, "weights": [10, 10, 10], "expected": "<paste>", "note": "equal weights, indivisible remainder — tie-break order is part of the contract" },
    { "totalCents": 3798, "weights": [20, 10], "expected": "<paste>", "note": "the variety-case example from the spec" },
    { "totalCents": 1000, "weights": [1, 1, 1], "expected": "<paste>", "note": "classic 3-way split" },
    { "totalCents": 0, "weights": [3, 2], "expected": [0, 0], "note": "free is free" },
    { "totalCents": 500, "weights": [0, 0], "expected": [0, 0], "note": "zero total weight short-circuits to zeros" },
    { "totalCents": 101, "weights": [1, 1, 1, 1, 1, 1, 1], "expected": "<paste>", "note": "more parts than remainder pennies" },
    { "totalCents": 2599, "weights": [12, 18, 6], "expected": "<paste>", "note": "uneven weights" }
  ]
}
```

Replace every `"<paste>"` with the real array from the run above. (The step is complete only when no `<paste>` remains.)

- [ ] **Step 2: Drive the TS test from the vectors**

Append to `allocate.test.ts` (keep the existing hand-written cases):

```ts
import vectors from "./vectors.json";

describe("vectors.json", () => {
  for (const v of vectors.allocate) {
    it(`${v.totalCents} across ${JSON.stringify(v.weights)} — ${v.note}`, () => {
      expect(allocateProportionally(v.totalCents, v.weights)).toEqual(v.expected);
    });
  }

  it("covers the degenerate cases", () => {
    expect(vectors.allocate.some((v) => v.totalCents === 0)).toBe(true);
    expect(vectors.allocate.some((v) => v.weights.every((w) => w === 0))).toBe(true);
  });
});
```

- [ ] **Step 3: Run and verify**

Run: `bun run --cwd packages/domain test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/money/
git commit -m "test(domain): shared allocation vectors, TS as reference"
```

---

### Task 8: Swift `Allocate` port + symlinked vectors

**Files:**
- Create: `ios/Vendpire/Domain/Allocate.swift`
- Create: `ios/VendpireTests/AllocateTests.swift`
- Create (symlink): `ios/VendpireTests/allocate-vectors.json → ../../packages/domain/src/money/vectors.json`

**Interfaces:**
- Consumes: Task 7's vectors.
- Produces: `Allocate.proportionally(totalCents: Int, weights: [Int]) -> [Int]` — used by the split preview in Task 14.

- [ ] **Step 1: Create the symlink and the failing test**

```bash
ln -s ../../packages/domain/src/money/vectors.json ios/VendpireTests/allocate-vectors.json
```

```swift
// ios/VendpireTests/AllocateTests.swift
import XCTest
@testable import Vendpire

final class AllocateTests: XCTestCase {
    private struct Vectors: Decodable {
        struct Case: Decodable { let totalCents: Int; let weights: [Int]; let expected: [Int]; let note: String }
        let allocate: [Case]
    }

    private var vectors: Vectors!

    override func setUpWithError() throws {
        let bundle = Bundle(for: AllocateTests.self)
        let url = try XCTUnwrap(
            bundle.url(forResource: "allocate-vectors", withExtension: "json"),
            "allocate-vectors.json is not in the test bundle"
        )
        vectors = try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
    }

    func testEveryVectorMatchesTheReferenceImplementation() {
        for v in vectors.allocate {
            XCTAssertEqual(Allocate.proportionally(totalCents: v.totalCents, weights: v.weights),
                           v.expected, v.note)
        }
    }

    func testVectorsHaveNotEroded() {
        XCTAssertGreaterThanOrEqual(vectors.allocate.count, 5)
        XCTAssertTrue(vectors.allocate.contains { $0.totalCents == 0 })
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run ios:test` (device attached)
Expected: FAIL — `Allocate` undefined.

- [ ] **Step 3: Port the implementation**

Port of `packages/domain/src/money/allocate.ts` — mirror it exactly, including the stable tie-break (TS `sort` is stable; use `enumerated()` + stable sort):

```swift
// ios/Vendpire/Domain/Allocate.swift
import Foundation

/// Largest-remainder money split, ported from packages/domain/src/money/allocate.ts
/// and pinned to the same vectors. Display preview ONLY — the server's
/// expandPackLines stays authoritative for what gets stored.
nonisolated enum Allocate {
    /// Parts always sum EXACTLY to totalCents: leftover pennies go to the
    /// largest fractional shares first (ties keep input order, as in TS).
    static func proportionally(totalCents: Int, weights: [Int]) -> [Int] {
        let totalWeight = weights.reduce(0, +)
        guard totalWeight > 0 else { return weights.map { _ in 0 } }

        let exact = weights.map { Double(totalCents * $0) / Double(totalWeight) }
        var result = exact.map { Int($0.rounded(.down)) }
        var remainder = totalCents - result.reduce(0, +)

        let order = exact.enumerated()
            .map { (index: $0.offset, frac: $0.element - $0.element.rounded(.down)) }
            .sorted { $0.frac > $1.frac }   // Swift sort is stable since 5.x
        for entry in order where remainder > 0 {
            result[entry.index] += 1
            remainder -= 1
        }
        return result
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run ios:test`
Expected: PASS, including the existing suites.

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/Domain/Allocate.swift ios/VendpireTests/AllocateTests.swift ios/VendpireTests/allocate-vectors.json
git commit -m "feat(ios): port allocateProportionally for the split preview, vector-pinned"
```

---

# Part C — iOS

### Task 9: `PurchaseSubmission` and the outbox producer

**Files:**
- Create: `ios/Vendpire/Remote/PurchaseSubmission.swift`
- Modify: `ios/Vendpire/Store/Model/OutboxItem.swift` (second convenience init)
- Test: `ios/VendpireTests/PurchaseSubmissionTests.swift`

**Interfaces:**
- Produces:
```swift
nonisolated struct PurchaseSubmission: Codable, Equatable, Sendable {
    let purchasedAt: Date
    let vendor: String
    let lines: [PurchaseSubmissionLine]
    let packLines: [PurchaseSubmissionPackLine]
    let receiptTotalCents: Int?
    let notes: String?
    let clientRequestId: String
    static func makeEncoder() -> JSONEncoder   // .iso8601, like VisitSubmission
    static func makeDecoder() -> JSONDecoder
}
nonisolated struct PurchaseSubmissionLine: Codable, Equatable, Sendable {
    let productId: String; let units: Int; let totalCostCents: Int; let packId: String?
}
nonisolated struct PurchaseSubmissionPackLine: Codable, Equatable, Sendable {
    let packId: String; let qty: Int; let totalCostCents: Int
}
// OutboxItem:
convenience init(purchase: PurchaseSubmission) throws  // kind "purchase", countedAt = purchasedAt
```
- Consumed by Tasks 10 and 14.

- [ ] **Step 1: Write the failing tests**

```swift
// ios/VendpireTests/PurchaseSubmissionTests.swift
import XCTest
@testable import Vendpire

final class PurchaseSubmissionTests: XCTestCase {
    private func submission() -> PurchaseSubmission {
        PurchaseSubmission(
            purchasedAt: Date(timeIntervalSince1970: 1_790_000_000),
            vendor: "Costco",
            lines: [.init(productId: "a".padding(toLength: 24, withPad: "a", startingAt: 0),
                          units: 24, totalCostCents: 1299, packId: nil)],
            packLines: [.init(packId: "b".padding(toLength: 24, withPad: "b", startingAt: 0),
                              qty: 2, totalCostCents: 3798)],
            receiptTotalCents: 5097,
            notes: nil,
            clientRequestId: "test-request-id-1234"
        )
    }

    func testRoundTripsThroughItsOwnCoders() throws {
        let data = try PurchaseSubmission.makeEncoder().encode(submission())
        let back = try PurchaseSubmission.makeDecoder().decode(PurchaseSubmission.self, from: data)
        XCTAssertEqual(back, submission())
    }

    func testDatesEncodeAsIso8601() throws {
        let data = try PurchaseSubmission.makeEncoder().encode(submission())
        let json = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(json.contains("\"purchasedAt\":\"2026-"), json)
    }

    @MainActor
    func testOutboxItemCarriesTheKindAndId() throws {
        let item = try OutboxItem(purchase: submission())
        XCTAssertEqual(item.kind, "purchase")
        XCTAssertEqual(item.id, "test-request-id-1234")
        XCTAssertEqual(item.countedAt, submission().purchasedAt)
        let decoded = try PurchaseSubmission.makeDecoder()
            .decode(PurchaseSubmission.self, from: item.payload)
        XCTAssertEqual(decoded, submission())
    }
}
```

- [ ] **Step 2: Run to verify failure** — `bun run ios:test`, expect compile failure on the missing types.

- [ ] **Step 3: Implement**

`PurchaseSubmission.swift` exactly per the Interfaces block, with coders mirroring `VisitSubmission.makeEncoder()/makeDecoder()` (`dateEncodingStrategy = .iso8601`). Then on `OutboxItem`:

```swift
    /// The Phase 9 producer the class doc promised. `countedAt` doubles as the
    /// queue's ordering date — for a purchase that is when it was bought.
    convenience init(purchase: PurchaseSubmission) throws {
        self.init(
            id: purchase.clientRequestId,
            kind: "purchase",
            countedAt: purchase.purchasedAt,
            payload: try PurchaseSubmission.makeEncoder().encode(purchase)
        )
    }
```

- [ ] **Step 4: Run tests** — `bun run ios:test`, expect PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/Remote/PurchaseSubmission.swift ios/Vendpire/Store/Model/OutboxItem.swift ios/VendpireTests/PurchaseSubmissionTests.swift
git commit -m "feat(ios): PurchaseSubmission payload and its outbox producer"
```

---

### Task 10: The network edge learns `kind`

**Files:**
- Modify: `ios/Vendpire/Services/VendpireAPI/VendpireAPIClient+Outbox.swift`
- Test: `ios/VendpireTests/VendpireAPIClientSubmitTests.swift` (extend)

**Interfaces:**
- Consumes: `PurchaseSubmission` (Task 9), generated `Operations.createPurchase` (already in the spec).
- Produces: `submit(_:)` dispatching on `request.kind`: `"visit"` → existing path, `"purchase"` → `createPurchase`, anything else → `.permanent`. A private `outcome(for: Operations.createPurchase.Output)` overload mirroring the visit one.

- [ ] **Step 1: Write the failing tests**

Extend `VendpireAPIClientSubmitTests.swift` using its existing `StubTransport` pattern (status + JSON in, `SubmitOutcome` out). Build a purchase request helper:

```swift
    private func purchaseRequest() throws -> OutboxRequest {
        let submission = PurchaseSubmission(
            purchasedAt: Date(timeIntervalSince1970: 1_790_000_000),
            vendor: "Costco", lines: [], packLines: [
                .init(packId: String(repeating: "b", count: 24), qty: 1, totalCostCents: 3798),
            ],
            receiptTotalCents: nil, notes: nil, clientRequestId: "purchase-req-0001"
        )
        return OutboxRequest(kind: "purchase", clientRequestId: submission.clientRequestId,
                             payload: try PurchaseSubmission.makeEncoder().encode(submission))
    }

    func testPurchase200IsAccepted() async throws { /* stub 200 + minimal Purchase JSON body → .accepted */ }
    func testPurchase400IsPermanentWithTheServersMessage() async throws { /* stub 400 {"message":"Unknown pack: x"} → .permanent(message: "Unknown pack: x") */ }
    func testPurchase401IsUnauthorized() async throws { /* → .unauthorized */ }
    func testUnknownKindIsPermanentNotCrash() async throws {
        let outcome = await client.submit(OutboxRequest(kind: "mystery", clientRequestId: "x", payload: Data()))
        guard case .permanent = outcome else { return XCTFail("unknown kind must park, not retry: \(outcome)") }
    }
```

Fill the stub bodies by copying the existing visit submit tests in the same file — the 200 body must satisfy the generated `Purchase` schema (copy field names from `openapi/vendpire.yaml` components → `Purchase`).

- [ ] **Step 2: Run to verify failure** — `bun run ios:test`; the unknown-kind test fails (today every kind decodes as a visit), purchase tests fail.

- [ ] **Step 3: Implement the dispatch**

Rework `submit(_:)`:

```swift
    func submit(_ request: OutboxRequest) async -> SubmitOutcome {
        switch request.kind {
        case "visit": return await submitVisit(request)
        case "purchase": return await submitPurchase(request)
        default:
            // An old app meeting a future item: park it where a human sees it.
            return .permanent(message: "This app is too old to send a \(request.kind). Update and retry.")
        }
    }
```

`submitVisit` is the existing body, extracted verbatim. `submitPurchase` mirrors it:

```swift
    private func submitPurchase(_ request: OutboxRequest) async -> SubmitOutcome {
        guard let submission = try? PurchaseSubmission.makeDecoder()
                .decode(PurchaseSubmission.self, from: request.payload)
        else { return .permanent(message: "This purchase could not be read back from the queue.") }
        do {
            let response = try await client.createPurchase(.init(body: .json(submission.generated)))
            return Self.outcome(for: response)
        } catch let error as ClientError {
            if let code = error.response?.status.code, (200..<300).contains(code) { return .accepted }
            return .retryable
        } catch { return .retryable }
    }

    private static func outcome(for response: Operations.createPurchase.Output) -> SubmitOutcome {
        switch response {
        case .ok: return .accepted
        case .badRequest(let rejection):
            return .permanent(message: (try? rejection.body.json.message) ?? "The server rejected this purchase.")
        case .unauthorized: return .unauthorized
        case .forbidden: return .noOrganization
        case .upgradeRequired: return .blockedByUpdateFloor
        case .internalServerError, .undocumented: return .retryable
        }
    }
```

Plus the mapping extension in the same file (the write-path counterpart of `VisitSubmission.generated`):

```swift
private extension PurchaseSubmission {
    var generated: Operations.createPurchase.Input.Body.jsonPayload {
        .init(
            purchasedAt: purchasedAt,
            vendor: vendor,
            lines: lines.map { .init(productId: $0.productId, units: $0.units,
                                     totalCostCents: $0.totalCostCents, packId: $0.packId) },
            packLines: packLines.map { .init(packId: $0.packId, qty: $0.qty,
                                             totalCostCents: $0.totalCostCents) },
            receiptTotalCents: receiptTotalCents,
            notes: notes,
            clientRequestId: clientRequestId
        )
    }
}
```

(Exact generated member names may differ — the compiler tells you in this one file; that's the seam working as designed. If the 409 status was added to createPurchase errors in the spec, the generated Output gains a `.conflict` case — map it to `.permanent` with the body message.)

- [ ] **Step 4: Run tests** — `bun run ios:test`, expect PASS including existing visit submit tests.

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/Services/VendpireAPI/VendpireAPIClient+Outbox.swift ios/VendpireTests/VendpireAPIClientSubmitTests.swift
git commit -m "feat(ios): the outbox network edge dispatches purchases"
```

---

### Task 11: `VendpireAPI` grows the five scanner calls

**Files:**
- Modify: `ios/Vendpire/Remote/RemoteOrg.swift` (add `RemoteCandidate`, `RemoteProductDraft`, `RemotePackDraft`)
- Modify: `ios/Vendpire/Services/VendpireAPI/VendpireAPI.swift` (protocol)
- Modify: `ios/Vendpire/Services/VendpireAPI/Remote+Generated.swift` (mappings)
- Modify: `ios/Vendpire/Services/VendpireAPI/VendpireAPIClient.swift` (implementations)
- Modify: `ios/VendpireTests/StubVendpireAPI.swift`

**Interfaces:**
- Consumes: regenerated `openapi/vendpire.yaml` (Tasks 2/3/5) via the symlinked spec — the build plugin regenerates the client automatically.
- Produces, on `protocol VendpireAPI`:
```swift
    func fetchBarcodeCandidate(code: String) async throws -> RemoteCandidate?
    func createProduct(_ draft: RemoteProductDraft) async throws -> RemoteProduct
    func createPack(_ draft: RemotePackDraft) async throws -> RemotePack
    func attachProductBarcode(productId: String, code: String) async throws -> RemoteProduct
    func attachPackBarcode(packId: String, code: String) async throws -> RemotePack
```
with:
```swift
nonisolated struct RemoteCandidate: Decodable, Sendable { let name: String?; let brand: String?; let imageUrl: String? }
nonisolated struct RemoteProductDraft: Sendable {
    let name: String; let upc: String?; let category: String; let taxClass: String?
    let imageUrl: String?; let defaultPriceCents: Int
}
nonisolated struct RemotePackDraft: Sendable {
    let name: String; let barcodes: [String]; let contents: [PackContent]
}
```
(`active`/`tracksExpiration` are not in the drafts — the server defaults both to true, which is always what a scanner-created record wants.)

- [ ] **Step 1: Add the types and protocol methods; watch it fail to build**

Run: `bun run ios:build`
Expected: FAIL — `VendpireAPIClient` and `StubVendpireAPI` don't conform.

- [ ] **Step 2: Implement `VendpireAPIClient` conformance**

Follow the existing `fetchProducts` pattern (call generated operation, map via `Remote+Generated.swift`). Mapping additions in `Remote+Generated.swift`: `RemoteCandidate.init(_ generated: Components.Schemas.Candidate)`, and request-body builders from the two drafts. The attach calls pass `path: .init(id:)` + `body: .json(.init(code: code))`. A `nil` candidate body (the endpoint returns JSON `null`) maps to Swift `nil`.

- [ ] **Step 3: Update `StubVendpireAPI`**

Add the five closure hooks in the established style, each defaulting to `throw StubError.unreachable`, e.g.:

```swift
    var onFetchBarcodeCandidate: @Sendable (String) async throws -> RemoteCandidate? = { _ in throw StubError.unreachable }
    func fetchBarcodeCandidate(code: String) async throws -> RemoteCandidate? {
        callCount += 1; return try await onFetchBarcodeCandidate(code)
    }
```

- [ ] **Step 4: Build and run tests**

Run: `bun run ios:build && bun run ios:test`
Expected: PASS (all existing suites still green — nothing calls the new methods yet).

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/Remote/RemoteOrg.swift ios/Vendpire/Services/VendpireAPI/ ios/VendpireTests/StubVendpireAPI.swift
git commit -m "feat(ios): candidate lookup, create, and attach calls on the API seam"
```

---

### Task 12: Single-record mirror upserts

`MirrorWriter.apply` reconciles whole collections and DELETES absent rows — it must never be used for one record. These upserts are what make a scanner-created product resolve locally for the rest of the draft.

**Files:**
- Modify: `ios/Vendpire/Services/MirrorWriter/MirrorWriter.swift`
- Test: `ios/VendpireTests/MirrorWriterTests.swift` (extend; create if absent)

**Interfaces:**
- Produces: `func upsert(_ remote: RemoteProduct) throws`, `func upsert(_ remote: RemotePack) throws` on `MirrorWriter`. Consumed by Task 14's model.

- [ ] **Step 1: Write the failing tests**

```swift
    @MainActor
    func testUpsertInsertsOneProductWithoutTouchingOthers() throws {
        let context = ModelContext(try VendpireStore.makeInMemoryContainer())
        context.insert(StoredProduct(id: "p1", name: "Sprite", category: "drinks", defaultPriceCents: 150))
        try context.save()
        let writer = MirrorWriter(context: context)

        try writer.upsert(RemoteProduct(id: "p2", name: "Coke Zero", upc: "00049000042559",
                                        category: "drinks", taxClass: nil, imageUrl: nil,
                                        defaultPriceCents: 175, active: true, deletedAt: nil, updatedAt: nil))

        let all = try context.fetch(FetchDescriptor<StoredProduct>())
        XCTAssertEqual(all.count, 2, "an upsert must never reconcile-delete the rest of the mirror")
        XCTAssertEqual(all.first { $0.id == "p2" }?.upc, "00049000042559")
    }

    @MainActor
    func testUpsertUpdatesInPlaceById() throws {
        // seed p1 with upc nil, upsert p1 with a upc, assert one row and the new upc
    }
```

(If `RemoteProduct`'s memberwise init isn't accessible from tests, decode a JSON literal with the fixture decoder instead — follow whatever the existing MirrorWriter tests do.)

- [ ] **Step 2: Run to verify failure** — `bun run ios:test`; `upsert` undefined.

- [ ] **Step 3: Implement**

```swift
    /// One record in, nothing else touched. The full-refresh reconcile deletes
    /// absent rows, so it must never be fed a single-record payload — this is
    /// the path for a product or pack created or attached mid-purchase.
    func upsert(_ remote: RemoteProduct) throws {
        let id = remote.id
        let existing = try context.fetch(
            FetchDescriptor<StoredProduct>(predicate: #Predicate { $0.id == id })
        ).first
        if let existing {
            existing.update(from: remote)
        } else {
            context.insert(StoredProduct(remote))
        }
        try context.save()
    }
```

Same shape for `RemotePack`/`StoredPack`.

- [ ] **Step 4: Run tests** — `bun run ios:test`, expect PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/Services/MirrorWriter/ ios/VendpireTests/
git commit -m "feat(ios): single-record mirror upserts for scanner-created records"
```

---

### Task 13: Catalog search + scan resolution + money text (pure domain)

Three small pure modules the purchase screen composes. All ported semantics, all unit-tested.

**Files:**
- Create: `ios/Vendpire/Domain/CatalogSearch.swift`
- Create: `ios/Vendpire/Domain/ScanResolution.swift`
- Create: `ios/Vendpire/Domain/Money.swift`
- Test: `ios/VendpireTests/CatalogSearchTests.swift`, `ScanResolutionTests.swift`, `MoneyTests.swift`

**Interfaces:**
- Produces:
```swift
// CatalogSearch.swift — port of packages/web/src/screens/purchases/catalogSearch.ts
nonisolated struct CatalogItem: Equatable, Identifiable, Sendable {
    enum Kind: Equatable, Sendable { case unit(imageUrl: String?); case pack(units: Int) }
    let kind: Kind; let recordId: String; let name: String; let barcode: String?
    var id: String { "\(isPack ? "pack" : "unit")-\(recordId)" }
    var isPack: Bool
}
nonisolated enum CatalogSearch {
    static func items(products: [StoredProduct], packs: [StoredPack]) -> [CatalogItem]  // active only
    static func search(_ items: [CatalogItem], query: String, limit: Int = 8) -> [CatalogItem]
}

// ScanResolution.swift — the resolver's first two arms, relocated on-device
nonisolated enum ScanResolution: Equatable, Sendable {
    case product(id: String)
    case pack(id: String)
    case unknown(gtin14: String, likelyCase: Bool)
    case invalid
    static func resolve(_ raw: String, products: [StoredProduct], packs: [StoredPack]) -> ScanResolution
}

// Money.swift — ports of web/src/utils/money.ts's two functions the screen needs
nonisolated enum Money {
    static func parseDollarsToCents(_ text: String) -> Int?   // "12.99" → 1299; "" / junk → nil
    static func formatCents(_ cents: Int) -> String           // 1299 → "$12.99"
}
```
- Consumed by Tasks 14 and 16.

- [ ] **Step 1: Write the failing tests**

Port the cases from `catalogSearch.test.ts` (read it first — same inputs, same expected ranking): exact-name beats prefix beats word-start beats mid-word; every term must match ("coke case" narrows); ties break to the shorter name; inactive records excluded; limit respected. For `ScanResolution`:

```swift
    func testOwnProductBeatsEverything() {
        let products = [StoredProduct(id: "p1", name: "Coke", upc: "00049000042559",
                                      category: "drinks", defaultPriceCents: 175)]
        XCTAssertEqual(ScanResolution.resolve("049000042559", products: products, packs: []),
                       .product(id: "p1"))
    }
    func testPackByAnyOfItsCaseCodes() { /* pack with barcodes ["10049000042556"], scan the raw UPC form → .pack */ }
    func testProductWinsWhenMirrorSomehowHoldsBoth() { /* same code on a product and a pack → .product (matches server precedence) */ }
    func testUnknownCarriesGtin14AndLikelyCase() {
        guard case .unknown(let gtin14, let likelyCase) =
            ScanResolution.resolve("10049000042556", products: [], packs: []) else { return XCTFail() }
        XCTAssertEqual(gtin14, "10049000042556"); XCTAssertTrue(likelyCase)
    }
    func testGarbageIsInvalid() { XCTAssertEqual(ScanResolution.resolve("hello", products: [], packs: []), .invalid) }
```

For `Money`: `"12.99" → 1299`, `"13" → 1300`, `".5" → 50`, `"12.999" → nil`, `"" → nil`, `"$12.99" → 1299` (strip `$` and whitespace — match the web's `parseDollarsToCents`; read `packages/web/src/utils/money.ts` first and port its exact accept/reject rules).

- [ ] **Step 2: Run to verify failure** — `bun run ios:test`.

- [ ] **Step 3: Implement all three**

`ScanResolution.resolve` is the heart — keep it tiny and exactly in server precedence order:

```swift
    static func resolve(_ raw: String, products: [StoredProduct], packs: [StoredPack]) -> ScanResolution {
        guard let normalized = Gtin.normalize(raw) else { return .invalid }
        if let product = products.first(where: { $0.upc == normalized.gtin14 }) {
            return .product(id: product.id)
        }
        if let pack = packs.first(where: { $0.barcodes.contains(normalized.gtin14) }) {
            return .pack(id: pack.id)
        }
        return .unknown(gtin14: normalized.gtin14, likelyCase: normalized.likelyCase)
    }
```

`CatalogSearch.search` ports `scoreTerm` (index 0 + full length → 0, prefix → 1, after a space → 2, mid-word → 3, absent → nil), sums across whitespace-split lowercased terms, requires all to match, sorts by score then name length, truncates to `limit`.

- [ ] **Step 4: Run tests** — `bun run ios:test`, expect PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/Domain/CatalogSearch.swift ios/Vendpire/Domain/ScanResolution.swift ios/Vendpire/Domain/Money.swift ios/VendpireTests/
git commit -m "feat(ios): catalog search, scan resolution, and money text — pure ports"
```

---

### Task 14: `PurchaseLogModel`

The screen's brain: rows, scan handling, draft validation, variance, submission. Follows the `VisitCaptureModel` pattern — `@MainActor @Observable`, zero-arg init, `ModelContext` passed per call.

**Files:**
- Create: `ios/Vendpire/Features/PurchaseLog/PurchaseLogModel.swift`
- Create: `ios/Vendpire/Features/PurchaseLog/PurchaseRow.swift`
- Test: `ios/VendpireTests/PurchaseLogModelTests.swift`

**Interfaces:**
- Consumes: `ScanResolution`, `CatalogSearch`, `Money`, `Allocate`, `OutboxItem(purchase:)`, `MirrorWriter.upsert`, `VendpireAPI` (candidate/create/attach).
- Produces:
```swift
nonisolated struct PurchaseRow: Equatable, Identifiable, Sendable {
    enum Kind: Equatable, Sendable { case unit, pack }
    let id: UUID
    let kind: Kind
    let recordId: String       // productId or packId
    let name: String           // denormalized for display
    var quantityText: String   // units or pack qty — backs a text field
    var totalCostText: String  // backs a text field
}

@MainActor @Observable final class PurchaseLogModel {
    // Entry state
    var vendor: String          // defaults "Costco"
    var purchasedDate: Date     // defaults now; submitted at local midday
    var notes: String
    var receiptTotalText: String
    private(set) var rows: [PurchaseRow]
    private(set) var pendingScan: PendingScan?   // set → not-found sheet is up
    private(set) var errorMessage: String?

    struct PendingScan: Equatable {
        let gtin14: String
        let likelyCase: Bool
        var candidate: RemoteCandidate?
    }

    // Reads
    var enteredCents: Int
    var varianceCents: Int?            // nil without a parseable receipt total
    func splitPreview(for row: PurchaseRow, context: ModelContext) -> [(name: String, units: Int, cents: Int)]?
    func searchResults(query: String, context: ModelContext) -> [CatalogItem]

    // Actions
    func configure(api: any VendpireAPI)                    // injected once from the view
    func handleScan(_ code: String, context: ModelContext)  // resolve → add/increment row, or set pendingScan + fetch candidate
    func add(_ item: CatalogItem)                           // manual pick → row
    func updateRow(id: UUID, quantityText: String?, totalCostText: String?)
    func removeRow(id: UUID)
    func dismissPendingScan()
    func attach(to item: CatalogItem, context: ModelContext) async
    func createUnit(name: String, category: String, priceText: String, context: ModelContext) async
    func createPack(name: String, contents: [NewPackContent], context: ModelContext) async
    struct NewPackContent: Equatable { var productId: String?; var unitsText: String
                                       var name: String; var category: String; var bagCode: String }
    func save(context: ModelContext) -> Bool                // validate → enqueue OutboxItem → true
}
```

- [ ] **Step 1: Write the failing tests**

Model them on `VisitCaptureModelTests` (in-memory container, seed, exercise, assert). Cover at minimum:

```swift
    func testKnownScanAddsARow() throws { /* seed product with upc, handleScan(raw UPC) → one unit row, name denormalized */ }
    func testRescanIncrementsInsteadOfDuplicating() throws { /* handleScan twice → one row, quantityText "2" */ }
    func testPackScanAddsAPackRowWithQty1() throws { /* seed pack with case code → kind .pack, quantityText "1" */ }
    func testUnknownScanParksAPendingScan() throws { /* no match → pendingScan set with gtin14 + likelyCase; rows unchanged */ }
    func testInvalidScanSetsAnErrorAndNothingElse() throws { /* "12345" → errorMessage, no row, no pendingScan */ }
    func testVarianceReadsOverAndUnder() throws { /* rows totalling 12.99, receipt "10.00" → varianceCents == 299 */ }
    func testSaveRejectsAHalfTypedRow() throws { /* row with empty cost → save false, errorMessage mentions the line */ }
    func testSaveEnqueuesOnePurchaseOutboxItem() throws {
        /* valid rows → save true; fetch OutboxItem, kind == "purchase",
           decode payload: unit rows → lines, pack rows → packLines,
           purchasedAt at local midday of purchasedDate, receiptTotalCents parsed */
    }
    func testSaveTwiceReusesTheClientRequestId() throws { /* save, save → second save false OR same id; the id is minted once per screen (model init) */ }
    func testSplitPreviewMatchesTheAllocator() throws { /* pack of [20,10] units, qty 1, cost "37.98" → preview cents == Allocate.proportionally(3798, [20,10]) */ }
```

- [ ] **Step 2: Run to verify failure** — `bun run ios:test`.

- [ ] **Step 3: Implement**

Key behaviors (write the rest straightforwardly):

- `clientRequestId` is `let clientRequestId = UUID().uuidString` minted in `init` — the web's "minted once when the form opens" rule; `save` after a successful save returns `false` with no error (the screen dismisses on first success anyway).
- `handleScan` fetches `StoredProduct`/`StoredPack` from the context, calls `ScanResolution.resolve`. `.product/.pack`: if a row with that `recordId`+kind exists, bump `quantityText` by 1; else append (`quantityText: "1"`, `totalCostText: ""`). `.unknown`: set `pendingScan`, then `Task { pendingScan?.candidate = try? await api.fetchBarcodeCandidate(code: gtin14) }` — a lookup failure leaves `candidate` nil, never blocks. `.invalid`: `errorMessage = "\"\(code)\" isn't a valid barcode — check the digits"`.
- `save(context:)` validates every row (`Int(quantityText) >= 1`, `Money.parseDollarsToCents(totalCostText) != nil`, else `errorMessage = "Line N: …"` and return false), builds `PurchaseSubmission` with unit rows → `lines` (`packId: nil`) and pack rows → `packLines`, `purchasedAt` anchored at **local midday** of `purchasedDate` (`Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: purchasedDate)!` — the same day-stability trick the web's `T12:00:00` suffix does), `receiptTotalCents` from `Money.parseDollarsToCents` (nil when blank), inserts `try OutboxItem(purchase:)`, `try context.save()`.
- `attach(to:)` calls `api.attachProductBarcode`/`attachPackBarcode` with `pendingScan!.gtin14`, upserts the returned record via `MirrorWriter(context:)`, appends/increments the row, clears `pendingScan`. On error: if the message contains `"already"` surface it with the existing-record name intact (the one-tap-attach UX lives in the sheet, Task 16); otherwise `errorMessage = error.localizedDescription`.
- `createUnit` builds `RemoteProductDraft(name:…, upc: pendingScan!.gtin14, category:…, taxClass: nil, imageUrl: pendingScan!.candidate?.imageUrl, defaultPriceCents: Money.parseDollarsToCents(priceText) ?? 0)` — empty price means decide later, not an error. `createPack` first creates any `NewPackContent` rows with `productId == nil` (own bag code normalized via `Gtin.normalize`, invalid → per-row error; image only when the case holds one product), then `RemotePackDraft(name:…, barcodes: [pendingScan!.gtin14], contents:…)`. **Partial failure keeps created products** — they were wanted; the error leaves the sheet open and a rerun picks them from the mirror (upsert each created product immediately).
- `splitPreview` returns nil unless the row is a pack with parseable qty/cost (a half-typed cost must not flash a wrong split); weights are `content.units * qty` and cents come from `Allocate.proportionally`.

- [ ] **Step 4: Run tests** — `bun run ios:test`, expect PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/Features/PurchaseLog/ ios/VendpireTests/PurchaseLogModelTests.swift
git commit -m "feat(ios): PurchaseLogModel — rows, resolution, variance, save"
```

---

### Task 15: The VisionKit scanner view + camera permission

**Files:**
- Create: `ios/Vendpire/Features/PurchaseLog/BarcodeScannerView.swift`
- Modify: `ios/Vendpire/Config/Info.plist` (camera usage string)

**Interfaces:**
- Produces: `struct BarcodeScannerView: UIViewControllerRepresentable` with `let onScan: (String) -> Void` — emits each newly recognized barcode's payload string once; stays running (continuous cart scanning). Consumed by Task 17's view.

- [ ] **Step 1: Add the permission string**

In `ios/Vendpire/Config/Info.plist` add:

```xml
<key>NSCameraUsageDescription</key>
<string>The camera reads barcodes while you log a purchase.</string>
```

- [ ] **Step 2: Implement the wrapper**

```swift
// ios/Vendpire/Features/PurchaseLog/BarcodeScannerView.swift
import SwiftUI
import VisionKit

/// Continuous barcode scanning for working through a cart: the scanner stays
/// up and each NEW tracked code fires once. VisionKit tracks items, so a can
/// held in frame doesn't re-fire; moving to the next item does.
struct BarcodeScannerView: UIViewControllerRepresentable {
    let onScan: (String) -> Void

    static var isSupported: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .itf14, .gs1DataBar])],
            qualityLevel: .accurate,
            recognizesMultipleItems: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        if !scanner.isScanning { try? scanner.startScanning() }
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onScan: (String) -> Void
        private var seen: Set<UUID> = []
        init(onScan: @escaping (String) -> Void) { self.onScan = onScan }

        func dataScanner(_ scanner: DataScannerViewController,
                         didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                guard case .barcode(let barcode) = item,
                      !seen.contains(item.id),
                      let payload = barcode.payloadStringValue else { continue }
                seen.insert(item.id)
                onScan(payload)
            }
        }
    }
}
```

- [ ] **Step 3: Build**

Run: `bun run ios:build`
Expected: builds clean. (The scanner is verified on-device in Task 17's manual check — the Simulator has no camera.)

- [ ] **Step 4: Commit**

```bash
git add ios/Vendpire/Features/PurchaseLog/BarcodeScannerView.swift ios/Vendpire/Config/Info.plist
git commit -m "feat(ios): VisionKit barcode scanner wrapper"
```

---

### Task 16: The not-found sheet (attach / create, full parity)

The web `BarcodeNotFoundPanel`, phone-shaped. The candidate renders as a visually separate "Maybe" card; attach and create are explicit peers — neither defaulted.

**Files:**
- Create: `ios/Vendpire/Features/PurchaseLog/BarcodeNotFoundSheet.swift`
- Test: behavior lives in `PurchaseLogModel` (Task 14, already tested); this task is view assembly.

**Interfaces:**
- Consumes: `PurchaseLogModel.PendingScan`, `model.searchResults`, `model.attach/createUnit/createPack/dismissPendingScan`, `Gtin.normalize` (bag-code pre-validation for inline feedback).
- Produces: `struct BarcodeNotFoundSheet: View` taking `@Bindable var model: PurchaseLogModel` and `@Environment(\.modelContext)`.

- [ ] **Step 1: Build the sheet**

Structure (one `NavigationStack` in a `.sheet`, driven by a local `enum Mode { case choose, attach, create }` `@State`):

- **Header, always visible:** "Barcode not found", the `gtin14` in monospaced text, and — when `model.pendingScan?.candidate?.name != nil` — the "Maybe" card: `AsyncImage` thumbnail, candidate name composed brand-first unless the name already contains it (port `candidateName` from the web panel), and a footnote "From Open Food Facts — not your catalog."
- **choose:** two prominent buttons — "It's already in my catalog" → `.attach`, "Create it" → `.create`. Below, a hint: "Your imported products arrived without barcodes — check before creating a duplicate."
- **attach:** a `TextField` seeded with the candidate name, a `List` of `model.searchResults(query:context:)` rows (kind badge Case/Item, name, barcode-or-"no barcode yet", unit count for packs); tapping a row runs `Task { await model.attach(to: item, context: context) }` with a `ProgressView` overlay while in flight.
- **create:** a `Picker("What is it?", selection:)` between Item/Case, preset from `pendingScan.likelyCase`.
  - *Item:* TextFields for name (seeded from candidate), category, vend price ("optional — set it on the planogram later"). Create button → `model.createUnit`.
  - *Case:* pack-name field showing the live suggestion ("<product> — case (N)" for single-content; stops updating once edited — a local `@State var nameTouched`), plus a contents editor: a `ForEach` of `model.NewPackContent` rows, each either a `Picker` over existing products or (default) new-product fields: name, category, units, bag code ("the single item's own code — never the case code you just scanned", validated inline with `Gtin.normalize`). "+ Add another product" appends a row. Create button → `model.createPack`.
- Any `model.errorMessage` renders in a red note at the top; the server's "already on …" conflict message appears there with the attach list one tap away (switch to `.attach` mode button beside it — the one-tap "use that instead").
- Cancel (`model.dismissPendingScan()`) in the toolbar; `.presentationDetents([.large])`.

Keep every behavior rule in the model (already tested); the sheet is layout + bindings only.

- [ ] **Step 2: Build and eyeball**

Run: `bun run ios:build` then `bun run ios:run` (Simulator is fine for layout) — open the purchase screen once Task 17 lands, or preview the sheet with `#Preview` and a stubbed model.

- [ ] **Step 3: Commit**

```bash
git add ios/Vendpire/Features/PurchaseLog/BarcodeNotFoundSheet.swift
git commit -m "feat(ios): the not-found sheet — attach before create, candidate as Maybe"
```

---

### Task 17: `PurchaseLogView` + the toolbar entry point

**Files:**
- Create: `ios/Vendpire/Features/PurchaseLog/PurchaseLogView.swift`
- Modify: `ios/Vendpire/Features/LocationList/LocationListView.swift` (toolbar, lines 50–57)

**Interfaces:**
- Consumes: everything above. The view owns `@State private var model = PurchaseLogModel()`, `@Environment(\.modelContext)`, and the app's `VendpireAPI` + `MirrorRefresher` from the environment (match however `LocationListView` obtains `refresher` — read it first and follow suit).

- [ ] **Step 1: Build the screen**

Anatomy top-to-bottom (a `Form`/`List`):

1. `DatePicker("Date", selection: $model.purchasedDate, displayedComponents: .date)` and `TextField("Vendor", text: $model.vendor)`.
2. A "Scan" button presenting `BarcodeScannerView` in a sheet (`.presentationDetents([.medium])` so rows stay visible beneath); each `onScan` routes to `model.handleScan(code, context: context)` — the sheet STAYS UP across scans; unknown codes swap it for `BarcodeNotFoundSheet`. Guard with `BarcodeScannerView.isSupported` and fall back to a disabled button with "Scanning needs a device camera".
3. "Add without scanning" button → a searchable mirror picker (reuse the attach-mode list component from Task 16) → `model.add(item)`.
4. The row list: per `PurchaseRow`, name + kind badge, quantity `TextField` (`.keyboardType(.numberPad)`), total-cost `TextField` (`.keyboardType(.decimalPad)`), swipe-to-delete → `model.removeRow`. Pack rows render the split preview line underneath ("↳ saves as 20 × Lays ($25.32) · 10 × Fritos ($12.66)") from `model.splitPreview`.
5. Receipt reconciliation: receipt-total `TextField`, "Entered: $X", and the over/under badge from `model.varianceCents` (green "matches receipt" at 0).
6. Notes `TextField`, then a prominent "Save Purchase" button → `if model.save(context: context) { dismiss() }`.

On appear: `model.configure(api: api)` and fire the one mirror refresh — `.task { await refresher.refresh() }` (the only refresh trigger in the flow; per-miss stays silent).

Entry point in `LocationListView`'s toolbar:

```swift
.toolbar {
    ToolbarItem(placement: .topBarLeading) {
        NavigationLink(destination: PurchaseLogView()) {
            Image(systemName: "cart.badge.plus")
        }
        .accessibilityLabel("Log Purchase")
    }
    ToolbarItem(placement: .topBarTrailing) {
        NavigationLink(destination: AccountView()) { Image(systemName: "person.crop.circle") }
            .accessibilityLabel("Account")
    }
}
```

- [ ] **Step 2: Run the whole suite**

Run: `bun run ios:test` (device)
Expected: PASS.

- [ ] **Step 3: Manual device check**

`bun run ios:run` on the attached phone: open Log Purchase → scan a real can (known product → row appears; rescan → increments) → scan something not in the catalog (sheet with Maybe card) → create it → row joins → type costs → watch variance → Save → Account → Waiting to sync shows the purchase → when it submits, confirm the purchase on the web `/purchases` list.

- [ ] **Step 4: Commit**

```bash
git add ios/Vendpire/Features/PurchaseLog/PurchaseLogView.swift ios/Vendpire/Features/LocationList/LocationListView.swift
git commit -m "feat(ios): the purchase log screen, scanner-first"
```

---

### Task 18: Outbox review knows purchases

**Files:**
- Modify: `ios/Vendpire/Domain/OutboxReview.swift`
- Modify: `ios/Vendpire/Features/Outbox/OutboxReviewView.swift`
- Test: `ios/VendpireTests/OutboxReviewTests.swift` (extend)

**Interfaces:**
- Consumes: `PurchaseSubmission.makeDecoder()`.
- Produces: purchase rows titled `"<vendor> · <total>"` (e.g. "Costco · $50.97", total = sum of line + packLine costs via `Money.formatCents`); a Discard affordance on `needsAttention` purchase rows.

- [ ] **Step 1: Write the failing tests**

```swift
    func testPurchaseRowIsTitledByVendorAndTotal() throws {
        // Build a PurchaseSubmission (lines 1299 + packLines 3798), OutboxItem(purchase:),
        // run OutboxReviewRow.rows(...) → title == "Costco · $50.97"
    }
    func testUnreadablePurchasePayloadFallsBackToKind() throws {
        // OutboxItem(kind: "purchase", payload: Data("junk".utf8), ...) → title "Purchase", no crash
    }
```

- [ ] **Step 2: Run to verify failure** — `bun run ios:test` (today the title is the bare `"Purchase"` fallback for both).

- [ ] **Step 3: Implement**

In `OutboxReview.swift`'s `title(for:…)`, before the capitalized-kind fallback:

```swift
        if item.kind == "purchase",
           let purchase = try? PurchaseSubmission.makeDecoder()
               .decode(PurchaseSubmission.self, from: item.payload) {
            let total = purchase.lines.reduce(0) { $0 + $1.totalCostCents }
                + purchase.packLines.reduce(0) { $0 + $1.totalCostCents }
            return "\(purchase.vendor) · \(Money.formatCents(total))"
        }
```

In `OutboxReviewView`, on `needsAttention` rows where `item.kind == "purchase"`, add next to Retry:

```swift
        Button("Discard", role: .destructive) { context.delete(item); try? context.save() }
```

(Visits keep their draft-based recovery; a purchase has no draft to reopen — discard-and-relog is the spec'd v1 path. Discard is this explicit button and nothing else — nothing is ever silently deleted.)

- [ ] **Step 4: Run tests** — `bun run ios:test`, expect PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/Vendpire/Domain/OutboxReview.swift ios/Vendpire/Features/Outbox/OutboxReviewView.swift ios/VendpireTests/OutboxReviewTests.swift
git commit -m "feat(ios): purchases in the outbox review — vendor, total, explicit discard"
```

---

# Part D — Docs

### Task 19: README numbering, the diagram, the runbook

**Files:**
- Modify: `README.md` (lines ~10–30: phase numbering + packages table)
- Create: `docs/diagrams/visit-capture.md`
- Create: `docs/runbooks/stuck-outbox.md`

- [ ] **Step 1: Fix the README**

Read `README.md:10-30`. Correct the iOS-via-REST note's phase numbers to match `docs/plans/2026-10-05-visits-and-ios.md` (REST surface = Phase 6, iOS mirror = Phase 7, capture + outbox = Phase 8, purchase logging + scanner = Phase 9). Add an `ios/` row to the packages table in the table's existing format, e.g.:

```markdown
| `ios/` | Native SwiftUI field app — SwiftData mirror + outbox over `/api/v1` (outside the Bun workspace) |
```

- [ ] **Step 2: Write `docs/diagrams/visit-capture.md`**

Follow the voice of the existing `docs/diagrams/*.md` (read `barcode-resolution.md` first). Content: a mermaid sequence diagram of the capture→outbox→server path — VisitCaptureView/Model → VisitDraft (SwiftData) → `makeSubmission()` → `OutboxItem` (id == clientRequestId, own-Codable payload + schemaVersion) → OutboxSubmitter drain (serial, oldest `countedAt` first, stop on first retryable) → network edge kind switch → `createVisit`/`createPurchase` → service → Mongo unique on `(orgId, clientRequestId)`. Include the failure-classification table (retryable / 401 re-auth once / 400-404 needsAttention / idempotent 200 = success) and the two invariants in prose: a row leaves the queue on success and no other way; never silently delete a draft. Note that purchases ride the same pipe with `kind: "purchase"` and no draft entity. Base it on the companion doc already written during design (same diagrams, repo-toned): the save-flow diagram in the Phase 9 spec.

- [ ] **Step 3: Write `docs/runbooks/stuck-outbox.md`**

Follow `docs/runbooks/job-recovery.md`'s format. Three scenarios, each with symptoms → diagnosis → fix:

1. **A row stuck in `needsAttention`** — where to see it (Account → Waiting to sync), what the message means (it is the server's own 400/404 text), the visit path (fix the draft, Retry) vs the purchase path (read the message, Discard, relog — no draft to edit), and the rule: the app never deletes a row itself.
2. **A lapsed Clerk session with pending rows** — symptoms (rows waiting, sign-in screen), why nothing is lost (401 never drops a draft; backoff caps at ~1h), fix: sign back in, foreground the app (drain fires on foreground), verify the queue empties.
3. **Confirming a submission landed exactly once** — on web: `/purchases` list (or visits on the machine) shows one row; on the server: the unique index on `(orgId, clientRequestId)` is the guarantee; a resubmitted row returns the existing document (200), so a retried item disappearing from the queue is proof of success, not of duplication. Include the mongo one-liner:

```bash
mongosh vendpire --eval 'db.purchases.aggregate([{ $group: { _id: "$clientRequestId", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])'
```

(expected output: nothing.)

- [ ] **Step 4: Verify and commit**

Run: `bun run lint` (markdown passes through fine; this catches stray issues in touched TS if any).

```bash
git add README.md docs/diagrams/visit-capture.md docs/runbooks/stuck-outbox.md
git commit -m "docs: phase-9 docs — README numbering, visit-capture diagram, stuck-outbox runbook"
```

---

### Task 20: Full verification sweep

- [ ] **Step 1: Run everything**

```bash
bun run typecheck && bun run lint && bun run test && bun run test:e2e
bun run ios:build && bun run ios:test   # device attached
```
Expected: all green. Fix anything that isn't before proceeding.

- [ ] **Step 2: The field test (the point of the phase)**

With the API deployed (or against local), log ONE real pending purchase end to end on the phone: scan everything in the haul, create the unknowns, reconcile against the receipt, Save, watch it drain, confirm on web `/purchases` that the stored expanded lines and receipt total look right. File anything awkward as follow-up notes — this is where the schema proves itself.

- [ ] **Step 3: Done**

Push the branch and open the PR titled "Phase 9: iOS purchase logging + scanner" referencing the spec and this plan.
