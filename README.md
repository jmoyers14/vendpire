# Vendpire

Vending machine route tracker: count-and-fill visit logging, inventory,
and profit reporting for a small vending operation. Two surfaces share one
backend — a React web dashboard for desk work and (from Phase 6) a native
iOS app for offline field work.

## Stack

- **Runtime / tooling:** Bun workspaces
- **API:** tRPC for the web dashboard, with a layered backend
  (data-access repositories → integrations adapters → services) wired
  together with tsyringe DI. A small REST/OpenAPI sync surface for iOS
  arrives in Phase 5.
- **Database:** MongoDB (Mongoose)
- **Frontend:** React + Vite + Tailwind, TanStack Router + Query
- **Auth:** Clerk — the Clerk organization IS the business (tenant);
  every business-scoped document keys on its orgId
- **Analytics:** PostHog (no-op without a key)

## Packages

| Package | Role |
|---|---|
| `packages/domain` | Pure domain logic + shared types: the calculation engine (units sold, weighted-average cost, profit). No I/O — runs in the browser as-is. |
| `packages/platform` | Cross-cutting infra: config slices, pino logging, Mongo connection, integration ports/adapters (Clerk, PostHog, task-queue seam), `registerServerCore`. |
| `packages/api` | tRPC server entrypoint: context, routers, business services. |
| `packages/web` | React dashboard. Imports the `AppRouter` **type** only — end-to-end types, zero runtime coupling. |
| `packages/e2e` | Playwright end-to-end tests. Worker-scoped fixtures boot an isolated stack per worker (in-memory Mongo + api + web), so specs run fully parallel. |

## Development

```sh
bun install
cp packages/api/.env.example packages/api/.env      # fill in CLERK_SECRET_KEY + MONGODB_URI
cp packages/web/.env.example packages/web/.env.local # fill in VITE_CLERK_PUBLISHABLE_KEY
bun run dev        # api on :3000, web on :5173
```

Checks: `bun run typecheck` · `bun run lint` · `bun run test`

### End-to-end tests

```sh
cp packages/e2e/.env.example packages/e2e/.env   # Clerk dev keys + a password test user
bun run --cwd packages/e2e install-browsers      # once
bun run test:e2e
```

Each Playwright worker boots its own in-memory MongoDB, api, and web server
on free ports, so the suite runs fully parallel with no shared state. The
api-only specs run without any keys; browser specs skip until
`CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` are set, and signed-in specs
additionally need `E2E_CLERK_USER_EMAIL`/`E2E_CLERK_USER_PASSWORD`
(a dedicated password user in the same Clerk dev instance).

## Conventions

- [Conventional Commits](https://www.conventionalcommits.org) (`feat:`,
  `fix:`, …) — release-please builds the changelog and owns the root
  `package.json` version. Don't hand-edit either.
- Prettier formats; Biome lints a single rule (`useBlockStatements` —
  always brace control-flow bodies).
- Money is integer cents; percentages are basis points; imports use
  explicit `.ts` extensions.

## Build stamp contract

The deploy pipeline injects `APP_VERSION` / `GIT_SHA` / `BUILT_AT` as
runtime env on the API, and `VITE_APP_VERSION` / `VITE_GIT_SHA` /
`VITE_BUILT_AT` as build args baked into the web bundle. The signed-in
footer shows the web stamp and flags a mismatch with the API's
`system.version` — a half-landed deploy.
