# /api/v1 REST/OpenAPI Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose ten existing tRPC procedures as a documented REST surface at `/api/v1`, generating a committed OpenAPI 3.1 document the iOS app can build a typed client from.

**Architecture:** A second *transport* over the existing `appRouter` — not a second API. `trpc-to-openapi` derives REST routes from the same procedures the web app calls, so there is no second implementation to keep in sync. One `node:http` server dispatches `/api/v1/*` to the OpenAPI handler and everything else to the tRPC handler, with CORS and the 426 client-support gate running upstream of both.

**Tech Stack:** Bun workspaces, TypeScript, tRPC 11.19.0, zod 4, `trpc-to-openapi` 3.3.3, `zod-openapi` 5.4.6, `bun:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-rest-openapi-surface-design.md`

## Global Constraints

- **zod is pinned to `^4.6.7`** in all three packages that declare it. Import from bare `"zod"` — never from `"zod/v4"` or `"zod/v3"`.
- **`@trpc/server` and `@trpc/client` are pinned to exactly `11.19.0`** — no caret.
- **OpenAPI version is 3.1.0.** Never pass `openApiVersion: "3.0.3"` — it prints `Invalid target: openapi-3.0` and still emits 3.1 syntax, producing a document that lies about its own version.
- **`auth.me` stays `protectedProcedure`.** Never `orgProtectedProcedure`.
- **`system.clientSupport` stays `publicProcedure`** with `protect: false`.
- **Naming:** follow `CLAUDE.md`. `build*` constructs in memory, `create` persists. TypeScript treats acronyms as words (`openApiDocument`, not `openAPIDocument`).
- **Timestamps are ISO-8601 strings in DTOs.** Money is integer cents. Percentages are basis points.
- **Never commit without the full suite green** (`bun run typecheck && bun run test && bun run lint`).
- **Run package-scoped tests from inside the package**, as `(cd packages/api && bun test <path>)` — never `bun test --cwd packages/api <path>`. `--cwd` does not pick up `packages/api/bunfig.toml`, which preloads `reflect-metadata`; without it any test reaching a tsyringe-decorated class fails for a reason that has nothing to do with the test. Found the hard way in Task 3.

## File Structure

| File | Responsibility |
|---|---|
| `packages/api/src/schemas/exactly.ts` | The compile-time DTO↔entity equality assertion, shared by every schema file |
| `packages/api/src/schemas/location.ts` | `locationDto` + `LocationDto` (the one deliberate `commission` omission) |
| `packages/api/src/schemas/machine.ts` | `machineDto` |
| `packages/api/src/schemas/product.ts` | `productDto` |
| `packages/api/src/schemas/pack.ts` | `packDto` |
| `packages/api/src/schemas/planogram.ts` | `planogramDto` |
| `packages/api/src/schemas/visit.ts` | `visitDto` (+ `visitLineDto`) |
| `packages/api/src/schemas/purchase.ts` | `purchaseDto` (+ `purchaseLineDto`) |
| `packages/api/src/schemas/identity.ts` | `identityDto` for `GET /me` |
| `packages/api/src/schemas/clientSupport.ts` | `clientSupportDto` for `GET /client-support` |
| `packages/api/src/schemas/index.ts` | Barrel; the generator script and routers import from here |
| `packages/api/src/openapi/buildOpenApiDocument.ts` | Pure document construction — the `override` hook and generator options live here so a test can call it without touching disk |
| `packages/api/scripts/generateOpenApi.ts` | Thin CLI: build the document, write `openapi/vendpire.yaml` |
| `packages/api/src/openapi/buildOpenApiDocument.test.ts` | Drift test + OpenAPI 3.1 meta-schema validation |
| `packages/api/src/index.ts` | Modified: own `http.createServer`, dispatch on `/api/v1`, share `logRequestError` |
| `packages/api/src/trpc.ts` | Modified: `initTRPC.meta<OpenApiMeta>()` |
| `packages/api/src/services/MobileClientSupportService/MobileClientSupportServiceImpl.ts` | Modified: exempt the REST client-support path from the 426 gate |
| `packages/e2e/fixtures.ts` | Modified: parameterized `apiStack` env |
| `packages/e2e/tests/rest.spec.ts` | REST surface e2e, including the idempotent re-POST |
| `packages/e2e/tests/clientSupport.spec.ts` | The two open `[P6]` forced-update e2e subtasks |

---

## Chunk A — Dependencies

Lands the zod 4 bump on its own so a zod-4 behavior change bisects to a three-line diff rather than a forty-file feature.

### Task 1: Bump zod to 4 and clear the deprecated `.url()` calls

**Files:**
- Modify: `packages/api/package.json:22`
- Modify: `packages/platform/package.json:27`
- Modify: `packages/worker/package.json:17`
- Modify: `packages/api/src/routers/products.ts:11`
- Modify: `packages/api/src/config/serverConfig.ts:13`
- Modify: `packages/api/src/config/mobileConfig.ts:19`
- Modify: `packages/platform/src/integrations/analytics/analyticsConfig.ts:18`
- Modify: `packages/platform/src/integrations/tasks/tasksConfig.ts:29`

**Interfaces:**
- Consumes: nothing.
- Produces: the zod 4 API behind the unchanged `import { z } from "zod"` in all 28 importing files.

**Context you need:** zod 3.25.x and zod 4.x ship the *same* v4 implementation behind different import paths. Bumping the package moves every file to the v4 API at once with **no import-line changes**. This is wanted: v3 and v4 schemas cannot nest (TS2740 at compile time, `keyValidator._parse is not a function` at runtime), so a partial migration is the broken state.

- [ ] **Step 1: Record the current state, so you can prove the bump changed nothing**

```bash
cd /Users/jeremymoyers/.herdr/worktrees/vendpire/phase-6
bun install
bun run typecheck && bun run test
```

Expected: PASS. If this is already red, stop and fix that first — you cannot attribute failures to the bump otherwise.

- [ ] **Step 2: Bump the three declarations**

In each of `packages/api/package.json`, `packages/platform/package.json`, `packages/worker/package.json`, change the `dependencies` entry:

```diff
-    "zod": "^3.22.4"
+    "zod": "^4.6.7"
```

- [ ] **Step 3: Install and typecheck**

```bash
bun install
bun run typecheck
```

Expected: PASS. If it fails, the error is local and specific — most likely a `.default()` input/output type shift surfacing through `parseConfig`'s generics. Fix it in place; do not revert the bump.

- [ ] **Step 4: Replace the five deprecated `z.string().url()` calls**

`z.string().url()` still works in v4 but is deprecated. Five sites:

```diff
# packages/api/src/routers/products.ts:11
-  imageUrl: z.string().url().nullable().default(null),
+  imageUrl: z.url().nullable().default(null),

# packages/api/src/config/serverConfig.ts:13
-  webUrl: z.string().url().default("http://localhost:5173"),
+  webUrl: z.url().default("http://localhost:5173"),

# packages/api/src/config/mobileConfig.ts:19
-  iosUpdateUrl: z.string().url().default("https://apps.apple.com/app/vendpire"),
+  iosUpdateUrl: z.url().default("https://apps.apple.com/app/vendpire"),

# packages/platform/src/integrations/analytics/analyticsConfig.ts:18
-  host: z.string().url().default(DEFAULT_POSTHOG_HOST),
+  host: z.url().default(DEFAULT_POSTHOG_HOST),

# packages/platform/src/integrations/tasks/tasksConfig.ts:29
-  workerUrl: z.string().url("WORKER_URL must be the worker's own base URL"),
+  workerUrl: z.url("WORKER_URL must be the worker's own base URL"),
```

Note the last one keeps its custom message — `z.url(message)` takes it the same way.

- [ ] **Step 5: Run the full suite**

```bash
bun run typecheck && bun run test && bun run lint
```

Expected: PASS, with the same test count as Step 1.

- [ ] **Step 6: Commit**

```bash
git add packages/api/package.json packages/platform/package.json packages/worker/package.json \
        packages/api/src/routers/products.ts packages/api/src/config/serverConfig.ts \
        packages/api/src/config/mobileConfig.ts \
        packages/platform/src/integrations/analytics/analyticsConfig.ts \
        packages/platform/src/integrations/tasks/tasksConfig.ts bun.lock
git commit -m "chore: bump zod 3.25 to 4.6.7

Nothing depended on zod 3 — the ^3.22.4 pins were scaffold-time defaults
and no third-party package in the tree declares a zod dependency at all.
3.25.x and 4.x ship the same v4 code behind different import paths, so the
version bump moves all 28 files at once with no import-line changes.

Also clears the five deprecated z.string().url() calls."
```

### Task 2: Pin tRPC and add the OpenAPI generator

**Files:**
- Modify: `package.json:36-39` (root `dependencies`)
- Modify: `packages/api/package.json` (`dependencies`)

**Interfaces:**
- Consumes: Task 1's zod 4.
- Produces: `trpc-to-openapi`'s `OpenApiMeta`, `generateOpenApiDocument`, `createOpenApiHttpHandler` importable from `packages/api`.

- [ ] **Step 1: Pin tRPC to exactly 11.19.0**

Root `package.json` — drop every caret so the generator's peer surface cannot drift:

```diff
-    "@trpc/client": "^11.8.1",
-    "@trpc/server": "^11.8.1",
-    "@trpc/tanstack-react-query": "^11.8.1"
+    "@trpc/client": "11.19.0",
+    "@trpc/server": "11.19.0",
+    "@trpc/tanstack-react-query": "11.19.0"
```

And `packages/api/package.json`:

```diff
-    "@trpc/server": "^11.8.1",
+    "@trpc/server": "11.19.0",
```

- [ ] **Step 2: Add the generator to `packages/api`**

```bash
cd packages/api
bun add trpc-to-openapi@3.3.3 zod-openapi@5.4.6
cd ../..
```

`zod-openapi` is a peer of `trpc-to-openapi`; declare it explicitly because `buildOpenApiDocument.ts` imports from it directly in Task 8.

- [ ] **Step 3: Verify the whole stack resolves**

```bash
bun install
bun run typecheck && bun run test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json packages/api/package.json bun.lock
git commit -m "chore: pin tRPC to 11.19.0 and add the OpenAPI generator

trpc-to-openapi 3.3.3 needs the zod v4 API and @trpc/server ^11.1.0.
Pinning tRPC exactly keeps the generator's peer surface from drifting."
```

---

## Chunk B — The gate fix

A latent bug with a silent failure mode. It lands before the mount so `client-support` is never unreachable.

### Task 3: Exempt the REST client-support path from the 426 gate

**Files:**
- Modify: `packages/api/src/services/MobileClientSupportService/MobileClientSupportServiceImpl.ts:15-16,73-77`
- Test: `packages/api/src/services/MobileClientSupportService/MobileClientSupportServiceImpl.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `isUnsupportedRequest({ header, path })` returning `false` for `/api/v1/client-support`.

**Context you need:** the gate currently exempts requests whose path starts with the tRPC procedure prefix `"system."`. When `client-support` becomes `GET /api/v1/client-support`, that match fails and the gate returns 426 for the one endpoint whose job is to explain the 426. The gate runs **before** the `/api/v1` prefix is stripped (Task 7), so it sees the full path.

- [ ] **Step 1: Write the failing tests**

Append to `packages/api/src/services/MobileClientSupportService/MobileClientSupportServiceImpl.test.ts`:

```ts
describe("MobileClientSupportServiceImpl REST path exemption", () => {
  const tooOld = { ...INERT, iosMinimumBuild: 43 };

  it("never gates the REST client-support path, or the wall cannot explain itself", () => {
    const service = new MobileClientSupportServiceImpl(tooOld);

    const blocked = service.isUnsupportedRequest({
      header: "ios/42",
      path: "/api/v1/client-support",
    });

    expect(blocked).toBe(false);
  });

  it("still gates other REST paths for a build below the floor", () => {
    const service = new MobileClientSupportServiceImpl(tooOld);

    const blocked = service.isUnsupportedRequest({
      header: "ios/42",
      path: "/api/v1/visits",
    });

    expect(blocked).toBe(true);
  });

  it("ignores a query string on the REST client-support path", () => {
    const service = new MobileClientSupportServiceImpl(tooOld);

    const blocked = service.isUnsupportedRequest({
      header: "ios/42",
      path: "/api/v1/client-support?platform=ios&build=42",
    });

    expect(blocked).toBe(false);
  });

  it("keeps exempting the tRPC system procedures, batched or not", () => {
    const service = new MobileClientSupportServiceImpl(tooOld);

    expect(
      service.isUnsupportedRequest({ header: "ios/42", path: "/system.version" }),
    ).toBe(false);
    expect(
      service.isUnsupportedRequest({
        header: "ios/42",
        path: "/system.version,system.clientSupport",
      }),
    ).toBe(false);
  });
});
```

If the file has no `INERT` constant, add it at the top:

```ts
const INERT: MobileConfig = {
  iosMinimumBuild: 0,
  iosRecommendedBuild: 0,
  iosUpdateUrl: "https://apps.apple.com/app/vendpire",
};
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
(cd packages/api && bun test src/services/MobileClientSupportService)
```

Expected: FAIL — the first and third cases return `true` because `/api/v1/client-support` does not start with `system.`.

- [ ] **Step 3: Add the REST convention to the exemption**

In `MobileClientSupportServiceImpl.ts`, replace the single prefix constant:

```ts
/** Procedures that stay reachable to a client the floor has refused. */
const UNGATED_TRPC_PREFIX = "system.";

/**
 * REST paths that stay reachable to a refused client. Two conventions rather
 * than one because the same gate sits in front of both transports: tRPC
 * addresses procedures by name, `/api/v1` addresses them by path. The gate runs
 * upstream of the prefix rewrite in index.ts, so the path here is the full one
 * the client sent.
 */
const UNGATED_REST_PATHS = new Set(["/api/v1/client-support"]);
```

and replace `isEntirelyUngated` with:

```ts
// httpBatchLink joins a batch's procedure names with commas, so the tRPC path
// is a list. The query string is dropped first — batched input is JSON, itself
// full of commas.
function isEntirelyUngated(path: string): boolean {
  const [withoutQuery = ""] = path.split("?");
  if (UNGATED_REST_PATHS.has(withoutQuery)) {
    return true;
  }
  const procedures = withoutQuery.replace(/^\//, "").split(",");
  return procedures.every((procedure) =>
    procedure.startsWith(UNGATED_TRPC_PREFIX),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
(cd packages/api && bun test src/services/MobileClientSupportService)
```

Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/MobileClientSupportService/
git commit -m "fix(api): exempt the REST client-support path from the 426 gate

The gate exempted on the \"system.\" tRPC procedure prefix. Once
client-support moves to /api/v1/client-support that match fails, and the
gate refuses the one endpoint whose job is to explain the refusal — a
walled client would see 426 with no way to learn why."
```

---

## Chunk C — Output schemas

The main cost of this phase: no procedure declares `.output()` today, so every response shape has to be written down and held to the entity type.

### Task 4: The exactness assertion and the Location DTO

**Files:**
- Create: `packages/api/src/schemas/exactly.ts`
- Create: `packages/api/src/schemas/location.ts`
- Test: `packages/api/src/schemas/location.test.ts`

**Interfaces:**
- Consumes: zod 4 from Task 1.
- Produces: `type Assert<T extends true>`, `type Equal<A, B>` from `exactly.ts`; `locationDto` (a `z.ZodObject`) and `type LocationDto` from `location.ts`.

**Context you need:** `Location.commission` is a 3-arm discriminated union (`LocationCommission`), the only union in the entity layer. It is cut from v1 because the phone has no use for it, which dodges a `oneOf` that `swift-openapi-generator` fights with. A plain `z.ZodType<Location>` annotation cannot express that omission, and — verified — it also fails to catch a *stale extra field left in the schema*, which is the direction that breaks Swift (`.output()` strips it at runtime while the spec still advertises it as required). The `Assert<Equal<...>>` pair catches both directions and matches the existing house idiom at `VisitRepository/types.ts:57`.

- [ ] **Step 1: Write `exactly.ts`**

```ts
/**
 * Compile-time proof that an output schema and its DTO type are the same shape.
 *
 * A plain `const dto: z.ZodType<Dto>` annotation catches a field ADDED to the
 * entity and a field whose type CHANGED — but not a stale field left behind in
 * the schema, because extra properties stay structurally assignable through a
 * generic. That direction is the damaging one: `.output()` strips the field at
 * runtime while the generated spec still advertises it as required, so the
 * phone decodes a required property that never arrives.
 *
 * Usage, one line under each schema:
 *
 *   export type LocationDtoMatches = Assert<Equal<z.infer<typeof locationDto>, LocationDto>>;
 *
 * When it fires the error is `Type 'false' does not satisfy the constraint
 * 'true'` on that line. It means the schema and the entity have drifted — fix
 * whichever one is wrong. Do NOT weaken the assertion to make the build pass;
 * catching this is the entire point of declaring the schemas.
 */

/** Fails to compile unless `T` is exactly `true`. Mirrors VisitRepository/types.ts:57. */
export type Assert<T extends true> = T;

/**
 * Structural equality in BOTH directions. The identical-function-signature
 * trick is what makes it bidirectional; a bare conditional would accept a
 * schema with extra properties.
 */
export type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <
  G,
>() => G extends B ? 1 : 2
  ? true
  : false;
```

- [ ] **Step 2: Write the failing test**

`packages/api/src/schemas/location.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { locationDto } from "./location.ts";

describe("locationDto", () => {
  it("accepts a location with every field populated", () => {
    const parsed = locationDto.parse({
      id: "0123456789abcdef01234567",
      name: "Front lobby",
      address: {
        line1: "1 Main St",
        city: "Sacramento",
        state: "CA",
        zip: "95814",
        geo: { lat: 38.58, lng: -121.49 },
      },
      contact: { name: "Dana", phone: "555-0100", email: "dana@example.com" },
      notes: "Behind the stairs",
      active: true,
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    });

    expect(parsed.name).toBe("Front lobby");
    expect(parsed.address.geo).toEqual({ lat: 38.58, lng: -121.49 });
  });

  it("accepts the nulls the entity allows", () => {
    const parsed = locationDto.parse({
      id: "0123456789abcdef01234567",
      name: "Back hall",
      address: { line1: null, city: null, state: null, zip: null, geo: null },
      contact: { name: null, phone: null, email: null },
      notes: null,
      active: false,
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    });

    expect(parsed.address.line1).toBeNull();
    expect(parsed.contact.email).toBeNull();
  });

  it("drops commission, so the phone never sees a 3-arm union", () => {
    const parsed = locationDto.parse({
      id: "0123456789abcdef01234567",
      name: "Front lobby",
      address: { line1: null, city: null, state: null, zip: null, geo: null },
      contact: { name: null, phone: null, email: null },
      notes: null,
      active: true,
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
      commission: { type: "percent", percentBps: 1500, basis: "gross" },
    });

    expect(parsed).not.toHaveProperty("commission");
  });

  it("registers under a component id, so the spec emits a named schema", () => {
    expect(locationDto.meta()?.id).toBe("Location");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
(cd packages/api && bun test src/schemas/location.test.ts)
```

Expected: FAIL — `Cannot find module './location.ts'`.

- [ ] **Step 4: Write `location.ts`**

```ts
import { z } from "zod";
import type { Location } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/**
 * What `GET /api/v1/locations` returns: the Location entity minus `commission`.
 *
 * `commission` is a 3-arm discriminated union and the only union in the entity
 * layer. It is cut from v1 — the phone has no use for it — which keeps a
 * `oneOf` out of the generated document, the shape swift-openapi-generator
 * fights hardest with. Declaring the omission as a type (rather than leaving
 * the schema un-annotated) keeps it an explicit decision.
 */
export type LocationDto = Omit<Location, "commission">;

export const locationDto = z
  .object({
    id: z.string(),
    name: z.string(),
    address: z.object({
      line1: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      zip: z.string().nullable(),
      geo: z.object({ lat: z.number(), lng: z.number() }).nullable(),
    }),
    contact: z.object({
      name: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    }),
    notes: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Location" });

export type LocationDtoMatches = Assert<
  Equal<z.infer<typeof locationDto>, LocationDto>
>;
```

- [ ] **Step 5: Run the test and typecheck**

```bash
(cd packages/api && bun test src/schemas/location.test.ts)
bun run --cwd packages/api typecheck
```

Expected: both PASS.

- [ ] **Step 6: Prove the assertion actually fires**

Temporarily add a field to the schema:

```ts
    active: z.boolean(),
    legacyField: z.string(),   // TEMPORARY
```

```bash
bun run --cwd packages/api typecheck
```

Expected: FAIL with `Type 'false' does not satisfy the constraint 'true'` on the `LocationDtoMatches` line. **Remove the temporary field** and re-run to confirm green. This step exists because an assertion that never fires is worse than none — it reads as protection that isn't there.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/schemas/
git commit -m "feat(api): add the DTO exactness assertion and the Location schema

Assert<Equal<...>> catches drift in both directions: a field added to the
entity, a field whose type changed, AND a stale field left in the schema.
The last is the one a plain z.ZodType<Dto> annotation misses, and it is the
one that breaks Swift — .output() strips the field at runtime while the
spec still advertises it as required."
```

### Task 5: The remaining eight schemas

**Files:**
- Create: `packages/api/src/schemas/machine.ts`, `product.ts`, `pack.ts`, `planogram.ts`, `visit.ts`, `purchase.ts`, `identity.ts`, `clientSupport.ts`, `index.ts`
- Test: `packages/api/src/schemas/schemas.test.ts`

**Interfaces:**
- Consumes: `Assert`, `Equal` from `./exactly.ts`; `locationDto` from `./location.ts`.
- Produces: from `./index.ts` — `locationDto`, `machineDto`, `productDto`, `packDto`, `planogramDto`, `visitDto`, `purchaseDto`, `identityDto`, `clientSupportDto`, and the `LocationDto` type.

**Context you need:** each schema gets `.meta({ id })` so it lands in `components/schemas` as a named, `$ref`'d type rather than being inlined per endpoint. Eight of the nine annotate directly against their entity type; only Location needs a DTO alias.

- [ ] **Step 1: Write `machine.ts`**

```ts
import { z } from "zod";
import type { Machine } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const machineDto = z
  .object({
    id: z.string(),
    locationId: z.string(),
    name: z.string(),
    kind: z.enum(["snack", "drink", "combo"]),
    make: z.string().nullable(),
    model: z.string().nullable(),
    serial: z.string().nullable(),
    tagCode: z.string().nullable(),
    templateId: z.string().nullable(),
    /** One array per shelf, slot codes in walking order. */
    slots: z.array(z.array(z.string())),
    cardReader: z
      .object({
        provider: z.enum(["nayax", "cantaloupe"]),
        deviceId: z.string(),
      })
      .nullable(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Machine" });

export type MachineDtoMatches = Assert<
  Equal<z.infer<typeof machineDto>, Machine>
>;
```

- [ ] **Step 2: Write `product.ts`**

```ts
import { z } from "zod";
import type { Product } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const productDto = z
  .object({
    id: z.string(),
    name: z.string(),
    /** The UNIT barcode, null until verified. */
    upc: z.string().nullable(),
    category: z.string(),
    taxClass: z.string().nullable(),
    imageUrl: z.string().nullable(),
    defaultPriceCents: z.number(),
    active: z.boolean(),
    tracksExpiration: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Product" });

export type ProductDtoMatches = Assert<
  Equal<z.infer<typeof productDto>, Product>
>;
```

Note `imageUrl` is `z.string()`, not `z.url()` — this is an *output* schema describing what the server returns, and validating a stored value's format on the way out would turn bad data into a 500 rather than a visible bad field.

- [ ] **Step 3: Write `pack.ts`**

```ts
import { z } from "zod";
import type { Pack } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const packDto = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Case-level barcodes, normalized to GTIN-14. */
    barcodes: z.array(z.string()),
    contents: z.array(
      z.object({ productId: z.string(), units: z.number() }),
    ),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Pack" });

export type PackDtoMatches = Assert<Equal<z.infer<typeof packDto>, Pack>>;
```

- [ ] **Step 4: Write `planogram.ts`**

```ts
import { z } from "zod";
import type { Planogram } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const planogramDto = z
  .object({
    id: z.string(),
    machineId: z.string(),
    effectiveFrom: z.string(),
    slots: z.array(
      z.object({
        slotCode: z.string(),
        productId: z.string(),
        /** Units the slot holds when full — the refill target. */
        par: z.number(),
        priceCents: z.number(),
      }),
    ),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Planogram" });

export type PlanogramDtoMatches = Assert<
  Equal<z.infer<typeof planogramDto>, Planogram>
>;
```

- [ ] **Step 5: Write `visit.ts`**

```ts
import { z } from "zod";
import type { Visit } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/** The five reasons a unit leaves a machine without being sold. */
const removalReason = z.enum([
  "expired",
  "damaged",
  "recalled",
  "destocked",
  "transferred",
]);

export const visitDto = z
  .object({
    id: z.string(),
    machineId: z.string(),
    /** Snapshot from the client — where the machine stood when counted. */
    locationId: z.string(),
    planogramId: z.string().nullable(),
    /** When you stood at the machine. The ordering key for everything. */
    countedAt: z.string(),
    recordedByUserId: z.string(),
    lines: z.array(
      z.object({
        slotCode: z.string(),
        productId: z.string(),
        /** What was in the slot on arrival, BEFORE refilling and removing. */
        remaining: z.number(),
        added: z.number(),
        removed: z.number(),
        removedReason: removalReason.nullable(),
        /** Snapshotted, so a later planogram edit cannot rewrite past revenue. */
        priceCents: z.number(),
        par: z.number().nullable(),
        /** The front unit's date, "YYYY-MM-DD". */
        bestBy: z.string().nullable(),
      }),
    ),
    notes: z.string().nullable(),
    clientRequestId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Visit" });

export type VisitDtoMatches = Assert<Equal<z.infer<typeof visitDto>, Visit>>;
```

- [ ] **Step 6: Write `purchase.ts`**

```ts
import { z } from "zod";
import type { Purchase } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const purchaseDto = z
  .object({
    id: z.string(),
    purchasedAt: z.string(),
    vendor: z.string(),
    lines: z.array(
      z.object({
        productId: z.string(),
        units: z.number(),
        /** The TOTAL for the line, not a unit cost — the receipt's number. */
        totalCostCents: z.number(),
        packId: z.string().nullable(),
      }),
    ),
    receiptTotalCents: z.number().nullable(),
    notes: z.string().nullable(),
    clientRequestId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Purchase" });

export type PurchaseDtoMatches = Assert<
  Equal<z.infer<typeof purchaseDto>, Purchase>
>;
```

- [ ] **Step 7: Write `identity.ts`**

```ts
import { z } from "zod";
import type { AuthIdentity } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/**
 * What `GET /api/v1/me` returns.
 *
 * `orgId` is NULLABLE and that is load-bearing: it is how a user with no
 * active organization discovers why they are stuck. The procedure behind this
 * is `protectedProcedure`, never `orgProtectedProcedure` — under an org gate
 * the call returns 403 with no way to tell "no org" from "no access".
 */
export const identityDto = z
  .object({
    userId: z.string(),
    orgId: z.string().nullable(),
    orgRole: z.string().nullable(),
    orgSlug: z.string().nullable(),
  })
  .meta({ id: "Identity" });

export type IdentityDtoMatches = Assert<
  Equal<z.infer<typeof identityDto>, AuthIdentity>
>;
```

- [ ] **Step 8: Write `clientSupport.ts`**

```ts
import { z } from "zod";
import type { UpdateRequirement } from "../services/MobileClientSupportService/MobileClientSupportService.ts";
import type { Assert, Equal } from "./exactly.ts";

/**
 * What `GET /api/v1/client-support` returns — the only unauthenticated endpoint
 * on the surface. A client old enough to be walled is likely also holding an
 * expired session, so a wall that needs a valid token is a wall that never
 * appears.
 */
export const clientSupportDto = z
  .object({
    updateRequirement: z.enum(["none", "recommended", "required"]),
    updateUrl: z.string(),
  })
  .meta({ id: "ClientSupport" });

type ClientSupportShape = {
  updateRequirement: UpdateRequirement;
  updateUrl: string;
};

export type ClientSupportDtoMatches = Assert<
  Equal<z.infer<typeof clientSupportDto>, ClientSupportShape>
>;
```

- [ ] **Step 9: Write the barrel `index.ts`**

```ts
/**
 * Output schemas for the `/api/v1` surface. One per entity, each annotated
 * against its entity type so a change to the entity is a TypeScript error
 * rather than silent spec drift, and each carrying `.meta({ id })` so the
 * generated document emits a named component instead of an inline copy.
 */
export { locationDto, type LocationDto } from "./location.ts";
export { machineDto } from "./machine.ts";
export { productDto } from "./product.ts";
export { packDto } from "./pack.ts";
export { planogramDto } from "./planogram.ts";
export { visitDto } from "./visit.ts";
export { purchaseDto } from "./purchase.ts";
export { identityDto } from "./identity.ts";
export { clientSupportDto } from "./clientSupport.ts";
export type { Assert, Equal } from "./exactly.ts";
```

- [ ] **Step 10: Write the test**

`packages/api/src/schemas/schemas.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  clientSupportDto,
  identityDto,
  machineDto,
  packDto,
  planogramDto,
  productDto,
  purchaseDto,
  visitDto,
} from "./index.ts";

describe("output schemas", () => {
  it("each registers a component id, so the spec emits named schemas", () => {
    expect(machineDto.meta()?.id).toBe("Machine");
    expect(productDto.meta()?.id).toBe("Product");
    expect(packDto.meta()?.id).toBe("Pack");
    expect(planogramDto.meta()?.id).toBe("Planogram");
    expect(visitDto.meta()?.id).toBe("Visit");
    expect(purchaseDto.meta()?.id).toBe("Purchase");
    expect(identityDto.meta()?.id).toBe("Identity");
    expect(clientSupportDto.meta()?.id).toBe("ClientSupport");
  });

  it("machineDto keeps the shelf-of-slot-codes shape", () => {
    const parsed = machineDto.parse({
      id: "0123456789abcdef01234567",
      locationId: "0123456789abcdef01234568",
      name: "Lobby snack",
      kind: "snack",
      make: null,
      model: null,
      serial: null,
      tagCode: null,
      templateId: null,
      slots: [["A1", "A2"], ["B1"]],
      cardReader: null,
      active: true,
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    });

    expect(parsed.slots).toEqual([["A1", "A2"], ["B1"]]);
  });

  it("visitDto accepts a removal reason and rejects an invented one", () => {
    const line = {
      slotCode: "A1",
      productId: "0123456789abcdef01234567",
      remaining: 2,
      added: 8,
      removed: 1,
      removedReason: "expired",
      priceCents: 175,
      par: 10,
      bestBy: "2026-11-01",
    };
    const base = {
      id: "0123456789abcdef01234567",
      machineId: "0123456789abcdef01234568",
      locationId: "0123456789abcdef01234569",
      planogramId: null,
      countedAt: "2026-10-21T00:00:00.000Z",
      recordedByUserId: "user_1",
      notes: null,
      clientRequestId: "req-1",
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    };

    expect(visitDto.parse({ ...base, lines: [line] }).lines[0]?.removedReason)
      .toBe("expired");
    expect(
      visitDto.safeParse({
        ...base,
        lines: [{ ...line, removedReason: "borrowed" }],
      }).success,
    ).toBe(false);
  });

  it("identityDto allows a null orgId — the pending-session discovery path", () => {
    const parsed = identityDto.parse({
      userId: "user_1",
      orgId: null,
      orgRole: null,
      orgSlug: null,
    });

    expect(parsed.orgId).toBeNull();
  });
});
```

- [ ] **Step 11: Run the tests and typecheck**

```bash
(cd packages/api && bun test src/schemas)
bun run --cwd packages/api typecheck
```

Expected: both PASS. A typecheck failure here means one of the eight `Assert` lines caught a real mismatch between your schema and the entity — read the entity type and fix the schema.

- [ ] **Step 12: Commit**

```bash
git add packages/api/src/schemas/
git commit -m "feat(api): add the remaining eight output schemas

One per entity, each held to its entity type by Assert<Equal<...>> and each
carrying .meta({ id }) so the generated document emits a named component
rather than inlining a copy per endpoint."
```

---

## Chunk D — Wiring

### Task 6: Declare the OpenAPI metadata on the ten procedures

**Files:**
- Modify: `packages/api/src/trpc.ts:5`
- Modify: `packages/api/src/routers/locations.ts`, `machines.ts`, `products.ts`, `packs.ts`, `planograms.ts`, `visits.ts`, `purchases.ts`, `auth.ts`, `system.ts`

**Interfaces:**
- Consumes: the schemas barrel from Task 5; `OpenApiMeta` from `trpc-to-openapi`.
- Produces: ten procedures carrying `.meta({ openapi })` and `.output()`. Nothing else in the router changes shape.

**Context you need:** `.meta()` is only available if `initTRPC` is given the meta type. `protect` controls what the *document* declares (bearer security plus 401/403 responses); enforcement still comes from the procedure's own middleware. Only procedures carrying `.meta({ openapi })` appear in the document — the other ~40 are untouched and invisible.

- [ ] **Step 1: Give `initTRPC` the meta type**

`packages/api/src/trpc.ts`:

```diff
 import { initTRPC, TRPCError } from "@trpc/server";
+import type { OpenApiMeta } from "trpc-to-openapi";
 import type { Context } from "./context.ts";
 import { ServiceError } from "./services/errors.ts";

-const t = initTRPC.context<Context>().create();
+// `.meta<OpenApiMeta>()` is what lets a procedure declare its REST route. Only
+// procedures that carry `.meta({ openapi })` reach the generated document; the
+// rest of the router stays web-only.
+const t = initTRPC.meta<OpenApiMeta>().context<Context>().create();
```

- [ ] **Step 2: Typecheck — this should change nothing yet**

```bash
bun run --cwd packages/api typecheck && (cd packages/api && bun test)
```

Expected: PASS. If the web package fails, stop — `OpenApiMeta` must not leak into the client's compile through `AppRouter`.

```bash
bun run --cwd packages/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Annotate the six org-scoped GET list procedures**

`locations.ts` — the `list` procedure only:

```ts
  list: orgProtectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/locations",
        tags: ["locations"],
        protect: true,
        summary: "Every location in the organization",
      },
    })
    .input(z.void())
    .output(z.array(locationDto))
    .query(({ ctx }) =>
      ctx.services.locationService.list(ctx.auth.orgId),
    ),
```

Add the import at the top: `import { locationDto } from "../schemas/index.ts";`

Apply the same shape to the other five. The `.input(z.void())` is required — a GET with no input still needs the parser declared so the generator knows there are no parameters.

| File | procedure | `path` | `tags` | schema |
|---|---|---|---|---|
| `machines.ts` | `list` | `/machines` | `["machines"]` | `z.array(machineDto)` |
| `products.ts` | `list` | `/products` | `["products"]` | `z.array(productDto)` |
| `packs.ts` | `list` | `/packs` | `["packs"]` | `z.array(packDto)` |
| `planograms.ts` | `listCurrentByOrg` | `/planograms/current` | `["planograms"]` | `z.array(planogramDto)` |
| `visits.ts` | `listLatestByOrg` | `/visits/latest` | `["visits"]` | `z.array(visitDto)` |

- [ ] **Step 4: Annotate the two POSTs**

`visits.ts` — the `create` procedure keeps its entire existing body (the replay guard, the anomaly logging, the analytics capture, and the final `return creation.visit`). Only the head changes:

```ts
  create: orgProtectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/visits",
        tags: ["visits"],
        protect: true,
        summary: "Record a servicing of one machine",
        description:
          "Idempotent on clientRequestId: a repeat submit returns the first visit rather than creating another.",
      },
    })
    .input(visitInput)
    .output(visitDto)
    .mutation(async ({ ctx, input }) => {
      // ... unchanged ...
    }),
```

`purchases.ts` — same treatment on `create`:

```ts
  create: orgProtectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/purchases",
        tags: ["purchases"],
        protect: true,
        summary: "Record one stock-buying run",
      },
    })
    .input(purchaseInput)
    .output(purchaseDto)
    .mutation(async ({ ctx, input }) => {
      // ... unchanged ...
    }),
```

- [ ] **Step 5: Annotate `me` and `clientSupport` — the two non-org tiers**

`auth.ts`:

```ts
  // Requires a signed-in user; returns the verified principal.
  //
  // protectedProcedure, NOT orgProtectedProcedure — and it must stay that way.
  // A user with no active organization gets `orgId: null` here, which is the
  // only way they can discover why they are stuck. Under an org gate this
  // returns 403 with no way to tell "no org" from "no access".
  me: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/me",
        tags: ["auth"],
        protect: true,
        summary: "The signed-in principal; orgId is null without an active org",
      },
    })
    .input(z.void())
    .output(identityDto)
    .query(({ ctx }) => {
      return {
        userId: ctx.auth.userId,
        orgId: ctx.auth.orgId,
        orgRole: ctx.auth.orgRole,
        orgSlug: ctx.auth.orgSlug,
      };
    }),
```

`auth.ts` currently imports no zod — add `import { z } from "zod";` and `import { identityDto } from "../schemas/index.ts";`.

`system.ts` — `clientSupport` keeps its whole body; note `protect: false`:

```ts
  clientSupport: publicProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/client-support",
        tags: ["system"],
        // The ONLY unauthenticated route on the surface. A client old enough
        // to be walled is likely also holding an expired session, and a wall
        // that needs a valid token is a wall that never appears.
        protect: false,
        summary: "Whether this iOS build is still supported",
      },
    })
    .input(
      z.object({
        platform: z.literal("ios"),
        // CFBundleVersion, not the marketing version. Arrives as the STRING
        // "43" in the query string; the generator coerces it from this schema.
        build: z.number().int().min(0),
      }),
    )
    .output(clientSupportDto)
    .query(({ ctx, input }) => {
      // ... unchanged ...
    }),
```

- [ ] **Step 6: Run the full suite**

```bash
bun run typecheck && bun run test && bun run lint
```

Expected: PASS. `.output()` strips unknown keys at runtime, so if an existing router test suddenly loses a field, the schema is missing it — fix the schema, not the test.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/trpc.ts packages/api/src/routers/
git commit -m "feat(api): declare OpenAPI metadata on the ten exposed procedures

Three auth tiers, so protect cannot be blanket-applied: client-support is
public, me is user-scoped (orgId nullable, the pending-session discovery
path), the other eight are org-scoped."
```

### Task 7: Mount the REST handler alongside tRPC

**Files:**
- Modify: `packages/api/src/index.ts:1-57`

**Interfaces:**
- Consumes: `appRouter`, `createContext`, `buildHttpMiddleware` — all unchanged.
- Produces: `/api/v1/*` served by the OpenAPI handler; everything else by tRPC.

**Context you need:** `createHTTPServer` is literally `http.createServer(createHTTPHandler(opts))`. Inlining that one line lets the callback branch. This adds **no second server, port, or process**. The gate must see the URL *before* the prefix is stripped, which is why the rewrite happens inside the branch and not earlier.

- [ ] **Step 1: Extract the error logger and mount both handlers**

Replace the imports and the `createHTTPServer(...)` call in `packages/api/src/index.ts`:

```ts
import http from "node:http";
import {
  createHTTPHandler,
} from "@trpc/server/adapters/standalone";
import { createOpenApiHttpHandler } from "trpc-to-openapi";
```

Add above `main`:

```ts
/** The `/api/v1` mount point. Stripped before the REST handler sees the URL. */
const API_V1_PREFIX = "/api/v1";

/**
 * The single place request errors are logged, shared by BOTH handlers. Uses the
 * request-scoped child (with orgId/userId/requestId) when the context was
 * built, else the root. INTERNAL_SERVER_ERROR is an unhandled bug — log at
 * error with the original cause's stack; everything else is a handled domain
 * error (NOT_FOUND, FORBIDDEN, …) and logs at warn so error tracking isn't
 * flooded by 4xxs.
 *
 * Extracted rather than passed inline because a separately-mounted handler does
 * not inherit the adapter's onError — every REST error would go unlogged.
 */
const logRequestError = ({ error, path, ctx }: TrpcErrorReport): void => {
  const log = ctx?.log ?? rootLogger;
  if (error.code === "INTERNAL_SERVER_ERROR") {
    log.error(
      { path, code: error.code, err: error.cause ?? error },
      "unhandled request error",
    );
  } else {
    log.warn({ path, code: error.code }, "request error");
  }
};
```

Declare the parameter type just above it (tRPC's own `onError` arg type is not exported in a usable form):

```ts
interface TrpcErrorReport {
  error: { code: string; cause?: unknown };
  path?: string | undefined;
  ctx?: { log?: Logger } | undefined;
}
```

and add `import type { Logger } from "@vendpire/platform";` to the existing platform import.

Then replace the server construction inside `main`:

```ts
  const trpcHandler = createHTTPHandler({
    router: appRouter,
    createContext,
    onError: logRequestError,
  });
  const restHandler = createOpenApiHttpHandler({
    router: appRouter,
    createContext,
    onError: logRequestError,
  });
  const runHttpMiddleware = buildHttpMiddleware({ webUrl, clientSupport });

  // One server. CORS and the 426 gate run once, upstream of both handlers; the
  // gate therefore sees the UNREWRITTEN url, which is why its exemption list
  // holds "/api/v1/client-support" rather than a stripped path.
  const server = http.createServer((req, res) => {
    runHttpMiddleware(req, res, (err?: unknown) => {
      if (err !== undefined && err !== null) {
        rootLogger.error({ err }, "middleware error");
        res.statusCode = 500;
        res.end();
        return;
      }
      if (req.url?.startsWith(API_V1_PREFIX) === true) {
        req.url = req.url.slice(API_V1_PREFIX.length) || "/";
        void restHandler(req, res);
        return;
      }
      void trpcHandler(req, res);
    });
  });
```

`buildHttpMiddleware` returns the structural `HttpMiddleware` type while `http.createServer` hands you `IncomingMessage`/`ServerResponse`. Those are structurally compatible for the fields the middleware reads (`url`, `method`, `headers`, `statusCode`, `setHeader`, `end`); if TypeScript objects, widen `MiddlewareRequest`/`MiddlewareResponse` in `packages/api/src/middleware/types.ts` rather than casting at the call site.

- [ ] **Step 2: Typecheck and run the suite**

```bash
bun run typecheck && bun run test && bun run lint
```

Expected: PASS.

- [ ] **Step 3: Boot the real server and exercise both transports**

```bash
cd packages/api
ENVIRONMENT=local PORT=3299 MONGODB_URI="mongodb://127.0.0.1:27017/vendpire" \
  CLERK_SECRET_KEY=sk_test_placeholder WEB_URL=http://localhost:5173 \
  POSTHOG_API_KEY="" IOS_MINIMUM_BUILD=43 bun src/index.ts &
sleep 3
echo "--- tRPC still at the root ---"
curl -s 'http://localhost:3299/system.version'
echo; echo "--- REST, unauthenticated, must be 200 ---"
curl -s -o /dev/null -w '%{http_code}\n' \
  'http://localhost:3299/api/v1/client-support?platform=ios&build=42'
echo "--- the same call's body, proving the string build coerced ---"
curl -s 'http://localhost:3299/api/v1/client-support?platform=ios&build=42'
echo; echo "--- a too-old build on a gated REST path must be 426 ---"
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Vendpire-Client: ios/42' \
  'http://localhost:3299/api/v1/visits/latest'
echo "--- a current build with no token must be 401, NOT 426 ---"
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Vendpire-Client: ios/50' \
  'http://localhost:3299/api/v1/visits/latest'
echo "--- client-support stays reachable even for a walled build ---"
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Vendpire-Client: ios/42' \
  'http://localhost:3299/api/v1/client-support?platform=ios&build=42'
kill %1
cd ../..
```

Expected: `200` / `{"updateRequirement":"required",...}` / `426` / `401` / `200`. The last line is the gate fix from Task 3 doing its job — if it is `426`, the exemption is not matching.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/index.ts packages/api/src/middleware/
git commit -m "feat(api): serve /api/v1 alongside tRPC on one http server

createHTTPServer is http.createServer(createHTTPHandler(opts)); inlining
that one line lets the callback branch on the path. No second server, port
or process. onError is extracted so both handlers share one error log — a
separately-mounted handler does not inherit the adapter's."
```

---

## Chunk E — Generation

### Task 8: Build and commit the OpenAPI document

**Files:**
- Create: `packages/api/src/openapi/buildOpenApiDocument.ts`
- Create: `packages/api/scripts/generateOpenApi.ts`
- Create: `openapi/vendpire.yaml` (generated, committed)
- Modify: `packages/api/package.json` (add the `openapi` script)

**Interfaces:**
- Consumes: `appRouter` from `../router.ts`.
- Produces: `buildOpenApiDocument(): OpenAPIObject` — pure, no disk access, so Task 9's test can call it directly.

**Context you need:** three settings carry real weight. `reused: "ref"` makes shared schemas emit as `$ref`s to named components rather than being inlined per endpoint. The `override` hook collapses `anyOf: [{type: T}, {type: "null"}]` into the canonical 3.1 `type: [T, "null"]`, which maps to a Swift optional rather than a wrapper enum — and the entities are full of nullable fields. And `additionalProperties` is stripped from *outputs only* so a field added to the server later cannot break an older phone build; request bodies never carry it, because zod's `$strip` drops unknown input keys rather than rejecting them.

- [ ] **Step 1: Write `buildOpenApiDocument.ts`**

```ts
import { generateOpenApiDocument } from "trpc-to-openapi";
import type { CreateDocumentOptions } from "zod-openapi";
import { appRouter } from "../router.ts";

/**
 * Collapses the two shapes the default rendering gets wrong for a native
 * client, and nothing else.
 */
const override: NonNullable<CreateDocumentOptions["override"]> = (ctx) => {
  const schema = ctx.jsonSchema as Record<string, unknown> & {
    anyOf?: Array<Record<string, unknown>>;
  };

  // 1. `anyOf: [{type: T}, {type: "null"}]` is how zod renders `.nullable()`.
  //    The canonical 3.1 spelling is `type: [T, "null"]`, which generators map
  //    to a plain optional instead of a wrapper enum. The entities are full of
  //    nullable fields, so this is the difference between `String?` and a
  //    generated anyOf container on every one of them.
  if (Array.isArray(schema.anyOf) && schema.anyOf.length === 2) {
    const nullArm = schema.anyOf.find((arm) => arm.type === "null");
    const valueArm = schema.anyOf.find((arm) => arm.type !== "null");
    if (nullArm && valueArm && typeof valueArm.type === "string") {
      delete schema.anyOf;
      Object.assign(schema, valueArm, { type: [valueArm.type, "null"] });
    }
  }

  // 2. Responses tolerate unknown keys, so adding a server field later cannot
  //    break a phone build compiled against today's document. Request bodies
  //    never carry additionalProperties in the first place — zod's `$strip`
  //    drops unknown input keys rather than rejecting them.
  if (ctx.io === "output") {
    delete schema.additionalProperties;
  }
};

/**
 * Builds the OpenAPI document from the router. Pure — writing it to disk is
 * `scripts/generateOpenApi.ts`, so the drift test can compare against this
 * without touching the filesystem.
 */
export function buildOpenApiDocument() {
  return generateOpenApiDocument(appRouter, {
    title: "Vendpire",
    description:
      "Sync surface for the Vendpire iOS app. Mirrors procedures the web dashboard calls over tRPC.",
    version: "1.0.0",
    baseUrl: "http://localhost:3210/api/v1",
    // 3.1.0 is not negotiable. Passing "3.0.3" prints `Invalid target:
    // openapi-3.0` and STILL emits 3.1 syntax, producing a document that lies
    // about its own version. Do not "fix" this string.
    openApiVersion: "3.1.0",
    securitySchemes: {
      bearer: {
        type: "http",
        scheme: "bearer",
        description: "A Clerk session token.",
      },
    },
    options: { reused: "ref", override },
  });
}
```

- [ ] **Step 2: Write the generator script**

`packages/api/scripts/generateOpenApi.ts`:

```ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { buildOpenApiDocument } from "../src/openapi/buildOpenApiDocument.ts";

const OUTPUT = path.join(import.meta.dir, "../../../openapi/vendpire.yaml");

const document = buildOpenApiDocument();
writeFileSync(OUTPUT, stringify(document), "utf8");
console.log(`wrote ${OUTPUT}`);
```

Add the `yaml` dependency and the script:

```bash
cd packages/api && bun add yaml && cd ../..
```

In `packages/api/package.json` `scripts`:

```json
    "openapi": "bun scripts/generateOpenApi.ts",
```

- [ ] **Step 3: Generate the document**

```bash
mkdir -p openapi
bun run --cwd packages/api openapi
```

Expected: `wrote .../openapi/vendpire.yaml`.

- [ ] **Step 4: Read the output and check the three things that matter**

```bash
echo "--- all ten paths present? ---"
grep -E '^  /' openapi/vendpire.yaml
echo "--- named components, not inlined copies? ---"
grep -E '^    [A-Z][A-Za-z]+:' openapi/vendpire.yaml | head
echo "--- nullables collapsed to type arrays, no anyOf-null left? ---"
grep -c 'anyOf' openapi/vendpire.yaml
echo "--- client-support must have NO security block ---"
grep -A12 '  /client-support:' openapi/vendpire.yaml | grep -c 'security' || true
echo "--- a gated path must have one ---"
grep -A12 '  /locations:' openapi/vendpire.yaml | grep -c 'security'
```

Expected: ten paths; `Location`, `Machine`, `Pack`, … as components; `0` occurrences of `anyOf`; `0` security lines under `/client-support`; `1` under `/locations`.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/openapi/ packages/api/scripts/ packages/api/package.json \
        openapi/vendpire.yaml bun.lock
git commit -m "feat(api): generate and commit openapi/vendpire.yaml

Committed so the Swift build never needs a running server. reused: ref
emits named components instead of inlining a copy per endpoint, and the
override hook collapses anyOf-null into the canonical 3.1 type array and
drops additionalProperties from responses so a new server field cannot
break an older phone build."
```

### Task 9: Fail CI on an un-regenerated or malformed document

**Files:**
- Create: `packages/api/src/openapi/buildOpenApiDocument.test.ts`

**Interfaces:**
- Consumes: `buildOpenApiDocument` from Task 8.
- Produces: nothing — this is the gate.

- [ ] **Step 1: Write the tests**

```ts
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { buildOpenApiDocument } from "./buildOpenApiDocument.ts";

const COMMITTED = path.join(import.meta.dir, "../../../../openapi/vendpire.yaml");

const EXPECTED_PATHS = [
  "/client-support",
  "/locations",
  "/machines",
  "/me",
  "/packs",
  "/planograms/current",
  "/products",
  "/purchases",
  "/visits",
  "/visits/latest",
];

describe("the committed OpenAPI document", () => {
  it("matches a fresh generation, so a schema change cannot ship un-regenerated", () => {
    const fresh = stringify(buildOpenApiDocument());
    const committed = readFileSync(COMMITTED, "utf8");

    expect(fresh).toBe(committed);
  });

  it("declares exactly the ten endpoints on the surface", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(Object.keys(document.paths).sort()).toEqual(EXPECTED_PATHS);
  });

  it("says it is OpenAPI 3.1 — the 3.0 target silently emits 3.1 syntax", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(document.openapi).toBe("3.1.0");
  });
});

describe("the surface's auth posture", () => {
  it("leaves client-support unsecured, or the wall cannot explain itself", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(document.paths["/client-support"].get.security).toBeUndefined();
  });

  it("secures every other endpoint", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    for (const route of EXPECTED_PATHS.filter((p) => p !== "/client-support")) {
      const operation =
        document.paths[route].get ?? document.paths[route].post;
      expect(operation.security).toEqual([{ bearer: [] }]);
    }
  });
});

describe("the shapes a Swift client has to decode", () => {
  it("emits named components rather than inlining a copy per endpoint", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining([
        "Location",
        "Machine",
        "Product",
        "Pack",
        "Planogram",
        "Visit",
        "Purchase",
        "Identity",
        "ClientSupport",
      ]),
    );
    expect(
      document.paths["/locations"].get.responses["200"].content[
        "application/json"
      ].schema.items.$ref,
    ).toBe("#/components/schemas/Location");
  });

  it("spells nullable as a type array, not anyOf — Swift maps that to an optional", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(
      document.components.schemas.Location.properties.notes.type,
    ).toEqual(["string", "null"]);
    expect(stringify(document)).not.toContain("anyOf");
  });

  it("lets responses carry unknown keys, so a new server field cannot break an old build", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(
      document.components.schemas.Location.additionalProperties,
    ).toBeUndefined();
  });

  it("omits commission from Location — the one deliberate cut", () => {
    const document = parse(readFileSync(COMMITTED, "utf8"));

    expect(document.components.schemas.Location.properties).not.toHaveProperty(
      "commission",
    );
  });
});
```

- [ ] **Step 2: Run them**

```bash
(cd packages/api && bun test src/openapi)
```

Expected: PASS. If the drift test fails, run `bun run --cwd packages/api openapi` and commit the regenerated file — that failure is the test working.

- [ ] **Step 3: Add the meta-schema validation test**

Install the validator and append to the same file:

```bash
cd packages/api && bun add -d @apidevtools/swagger-parser && cd ../..
```

Add this import **at the top of the file, beside the existing imports** — not
where the `describe` block goes:

```ts
import SwaggerParser from "@apidevtools/swagger-parser";
```

Then append the block at the end of the file:

```ts
describe("document validity", () => {
  it("is a valid OpenAPI document — the only check before Phase 7's Swift build", async () => {
    // validate() mutates its input by resolving $refs, so hand it a clone.
    const document = parse(readFileSync(COMMITTED, "utf8"));

    await expect(SwaggerParser.validate(document)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 4: Run the full suite**

```bash
bun run typecheck && bun run test && bun run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/openapi/ packages/api/package.json bun.lock
git commit -m "test(api): gate the committed spec on drift and validity

The drift test fails CI when a schema changes without regenerating. The
validity test is the only check standing between a malformed document and
discovering it in Phase 7 when the Swift build fails."
```

---

## Chunk F — End-to-end

### Task 10: Give the e2e api fixture a configurable environment

**Files:**
- Modify: `packages/e2e/fixtures.ts:145-190`

**Interfaces:**
- Consumes: nothing new.
- Produces: an `apiEnv` worker-scoped option that `test.use({ apiEnv: {...} })` can set per spec file.

**Context you need:** `apiStack` hardcodes the api's env block, so no spec can boot an api with a configured version floor. This blocks both remaining `[P6]` subtasks on the forced-update card AND the REST spec. Playwright re-instantiates worker fixtures when an option changes, so a spec that calls `test.use` gets its own api process.

- [ ] **Step 1: Add the option to the fixture types**

```ts
type WorkerOptions = {
  /**
   * Extra environment for the api process. A spec sets this with
   * `test.use({ apiEnv: { IOS_MINIMUM_BUILD: "43" } })`; Playwright starts a
   * fresh worker (and so a fresh api) whenever the value changes.
   */
  apiEnv: Record<string, string>;
};

type WorkerFixtures = {
  apiStack: ApiStack;
  workerStack: WorkerStack;
  webStack: WebStack;
};
```

- [ ] **Step 2: Thread it through `test.extend` and `apiStack`**

```ts
export const test = base.extend<Record<never, never>, WorkerFixtures & WorkerOptions>({
  apiEnv: [{}, { scope: "worker", option: true }],

  apiStack: [
    async ({ apiEnv }, use) => {
      const mongo = await MongoMemoryServer.create();
      const port = await freePort();
      const apiUrl = `http://localhost:${port}`;

      const { child: api, failureDetail } = spawnCaptured("bun", ["src/index.ts"], {
        cwd: path.join(repoRoot, "packages/api"),
        detached: true,
        env: {
          ...process.env,
          ENVIRONMENT: "local",
          PORT: String(port),
          MONGODB_URI: mongo.getUri("vendpire-e2e"),
          CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || "sk_test_placeholder",
          WEB_URL: "http://localhost:5173",
          POSTHOG_API_KEY: "",
          // Last, so a spec can override any of the above.
          ...apiEnv,
        },
      });

      try {
        await waitForHttp(`${apiUrl}/system.version`, 30_000, failureDetail);
        await use({ apiUrl, mongoUri: mongo.getUri("vendpire-e2e") });
      } finally {
        stop(api);
        await mongo.stop();
      }
    },
    { scope: "worker" },
  ],
```

Keep the existing comment block on `CLERK_SECRET_KEY` verbatim — it explains why `||` and not `??`.

- [ ] **Step 3: Verify nothing regressed**

```bash
bun run --cwd packages/e2e typecheck
bun run test:e2e
```

Expected: PASS, unchanged. The health check still hits `/system.version`, which Task 7 left at the root.

- [ ] **Step 4: Commit**

```bash
git add packages/e2e/fixtures.ts
git commit -m "test(e2e): let a spec configure the api process environment

apiStack hardcoded the env block, so no spec could boot an api with a
version floor set. Unblocks the two forced-update e2e subtasks and the
REST surface spec."
```

### Task 11: Cover the surface and the wall end to end

**Files:**
- Create: `packages/e2e/tests/clientSupport.spec.ts`
- Create: `packages/e2e/tests/rest.spec.ts`

**Interfaces:**
- Consumes: `test`, `apiStack`, `apiEnv` from `../fixtures.ts`.
- Produces: nothing.

**Context you need:** these specs are worth having for one reason above all — they are the only check that catches `client-support` being mounted behind auth. It is the one `publicProcedure` on an otherwise all-`orgProtectedProcedure` surface, and if it ends up protected, a blocked client with an expired session never sees the wall, silently. No service-level unit test can catch that.

- [ ] **Step 1: Write the client-support spec**

`packages/e2e/tests/clientSupport.spec.ts`:

```ts
import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";

// A real floor, so the interesting verdicts are reachable. Arrives at the api
// as the STRING "43" — which is half of what this spec proves.
test.use({ apiEnv: { IOS_MINIMUM_BUILD: "43", IOS_RECOMMENDED_BUILD: "50" } });

test.describe("GET /api/v1/client-support", () => {
  test("answers with no Authorization header at all", async ({ apiStack }) => {
    const response = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=42`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      updateRequirement: "required",
    });
  });

  test("survives the floor arriving as a string", async ({ apiStack }) => {
    const current = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=50`,
    );
    const nudged = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=45`,
    );

    expect((await current.json()).updateRequirement).toBe("none");
    expect((await nudged.json()).updateRequirement).toBe("recommended");
  });

  test("hands back somewhere to send people", async ({ apiStack }) => {
    const response = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=42`,
    );

    expect((await response.json()).updateUrl).toMatch(/^https?:\/\//);
  });
});

test.describe("the 426 backstop", () => {
  test("refuses a too-old build on a gated path, off the real wire", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/visits/latest`, {
      headers: { "X-Vendpire-Client": "ios/42" },
    });

    expect(response.status).toBe(426);
    expect(await response.json()).toMatchObject({
      error: { code: "UPGRADE_REQUIRED" },
    });
  });

  test("never refuses client-support itself, or the wall explains nothing", async ({
    apiStack,
  }) => {
    const response = await fetch(
      `${apiStack.apiUrl}/api/v1/client-support?platform=ios&build=42`,
      { headers: { "X-Vendpire-Client": "ios/42" } },
    );

    expect(response.status).toBe(200);
  });

  test("gives a current build 401, not 426 — the floor is not an auth error", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/visits/latest`, {
      headers: { "X-Vendpire-Client": "ios/50" },
    });

    expect(response.status).toBe(401);
  });

  test("passes through a request with no client header — the web app sends none", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/visits/latest`);

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it**

```bash
bun run test:e2e -- tests/clientSupport.spec.ts
```

Expected: PASS. A `426` on the second test in the second block means the Task 3 exemption is not matching the path.

- [ ] **Step 3: Write the surface spec**

`packages/e2e/tests/rest.spec.ts`:

```ts
import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";

/**
 * Unauthenticated coverage of the surface. Proving the routes are MOUNTED and
 * ORG-GATED needs no session: an org-scoped endpoint answering 401 to an
 * anonymous caller is exactly the evidence wanted, and a 404 would mean the
 * route never mounted at all. The authenticated read paths are covered by the
 * api's own unit tests against the same procedures.
 */
const ORG_SCOPED = [
  "/api/v1/locations",
  "/api/v1/machines",
  "/api/v1/products",
  "/api/v1/packs",
  "/api/v1/planograms/current",
  "/api/v1/visits/latest",
];

test.describe("the /api/v1 surface", () => {
  for (const route of ORG_SCOPED) {
    test(`${route} is mounted and refuses an anonymous caller`, async ({
      apiStack,
    }) => {
      const response = await fetch(`${apiStack.apiUrl}${route}`);

      expect(response.status).toBe(401);
    });
  }

  test("/api/v1/me is mounted and refuses an anonymous caller", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/me`);

    expect(response.status).toBe(401);
  });

  test("POST /api/v1/visits is mounted and refuses an anonymous caller", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/visits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machineId: "0123456789abcdef01234567" }),
    });

    expect(response.status).toBe(401);
  });

  test("POST /api/v1/purchases is mounted and refuses an anonymous caller", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/purchases`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vendor: "Costco" }),
    });

    expect(response.status).toBe(401);
  });

  test("an unknown /api/v1 route is a 404, not a tRPC error", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/api/v1/nope`);

    expect(response.status).toBe(404);
  });

  test("tRPC still serves the root, so the web app is unaffected", async ({
    apiStack,
  }) => {
    const response = await fetch(`${apiStack.apiUrl}/system.version`);

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("result");
  });
});
```

- [ ] **Step 4: Run it**

```bash
bun run test:e2e -- tests/rest.spec.ts
```

Expected: PASS. A `404` on a route that should be `401` means the path in the `.meta({ openapi })` does not match what the spec requests.

- [ ] **Step 5: Run everything**

```bash
bun run typecheck && bun run test && bun run lint && bun run test:e2e
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/e2e/tests/clientSupport.spec.ts packages/e2e/tests/rest.spec.ts
git commit -m "test(e2e): cover the /api/v1 surface and the update wall

The only check that catches client-support being mounted behind auth — the
one publicProcedure on an otherwise all-orgProtectedProcedure surface,
whose failure mode is a blocked client silently never seeing the wall.

Closes the two open [P6] subtasks on the forced-update card."
```

---

## Deferred — raise before closing the phase

### Stack traces in error bodies — pre-existing, but this phase widens the blast radius

Verified: with `NODE_ENV` unset, a REST error body carries a full stack trace.

```
GET /api/v1/nope
{"message":"Not found","code":"NOT_FOUND","data":{"code":"NOT_FOUND","httpStatus":404,
 "stack":"TRPCError: Not found\n    at <anonymous> (/…/node_modules/trpc-to-openapi/…)"}}
```

With `NODE_ENV=production` the `stack` key disappears. **`NODE_ENV` appears
nowhere in this repo** — not in `deploy.yml`, not in any config module; the
codebase uses its own `ENVIRONMENT` variable instead, and Cloud Run does not
set `NODE_ENV` on its own. So staging is almost certainly serving stacks today.

This is **pre-existing** — the tRPC surface already behaves this way — and is
not introduced by this phase. But this phase makes it materially easier to
reach: `GET /api/v1/client-support` is unauthenticated, so a stack trace
becomes available with no credential at all.

The fix is one line (set `NODE_ENV=production` on the deployed service, or give
`initTRPC` an `errorFormatter` that drops `stack`). It is **out of scope for
this plan** — raise it with the user and let them decide whether it lands here,
on its own card, or not yet.

### The idempotent re-POST

The **idempotent re-POST of a visit** (card subtask: *"REST e2e spec covering all nine endpoints + idempotent re-POST"*) is **not** covered by Task 11. It needs an authenticated session plus seeded machine, location and planogram rows, which no current e2e fixture provides — `visits.spec.ts` drives it through the browser, not the REST surface.

The idempotency logic itself is covered at the unit level in `VisitServiceImpl.test.ts`. What stays unproven is that the key survives the REST transport.

Two options, to decide with the user rather than silently skip:

1. Add an authenticated REST fixture (a Clerk token plus seeded org data) — real work, probably its own task.
2. Accept the unit-level coverage for v1 and revisit when the phone actually submits visits in Phase 8.

**Do not mark the card's e2e subtask done without raising this.**
