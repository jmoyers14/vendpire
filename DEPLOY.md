# Deploying vendpire

Three Cloud Run services on the **personal** Google account, isolated from the
work account via a dedicated gcloud *configuration* (same pattern as landscape).

> **This stack is staging, not production.** It runs on `*.run.app` against a
> Clerk **development** instance (`dynamic-kit-6657.clerk.accounts.dev`), because
> a Clerk production instance requires a domain we do not own yet. `deploy.sh`
> pins `DEPLOY_ENVIRONMENT="staging"` accordingly, so `/system.version`, the app
> footer, logs, and PostHog events all say `staging`.
>
> Nothing in the codebase branches on staging vs production — every check is
> `=== "local"` — so this is a labeling choice, not a behavioral one. The ordered
> steps for adding a real production environment are in the Environments section
> of `docs/plans/2026-10-06-cicd-pipeline.md`. Step one is buying a domain; it
> gates everything else.
>
> `ios/Config/Release.xcconfig` ships the same dev publishable key, and says so
> in a comment. It has to change at the same time.

- `vendpire-api` — Bun tRPC server (port 8080)
- `vendpire-web` — React build served by nginx (port 8080)
- `vendpire-worker` — Clerk webhook ingestion + background jobs (port 8080)

Pinned at the top of `deploy.sh`:

```bash
CONFIG="vendpire"
PROJECT="vendpire-128694"
ACCOUNT="jmoyers14@gmail.com"
REGION="us-central1"
```

## One-time setup (already done)

- gcloud configuration `vendpire` pinned to the personal account + project
- Project `vendpire-128694` created, billing linked
- APIs enabled: Cloud Run, Artifact Registry, Secret Manager
- Cloud Tasks + IAM Credentials are enabled by `deploy.sh` itself, along with
  the three queues and the `cloud-tasks-invoker` service account the worker's
  `/tasks/*` callbacks authenticate as. All idempotent.

## First deploy

The Mongo secret must come from the environment on the first run (the local
`.env` points at localhost):

```sh
MONGODB_URI="mongodb+srv://<user>:<pass>@<cluster>/vendpire" ./deploy.sh
```

Later deploys are just `./deploy.sh` — secrets already exist in Secret
Manager, and the Clerk publishable key is read from `packages/web/.env.local`.

## After the first deploy

1. Add the web URL to Clerk (Dashboard → your app → allowed origins /
   "Frontend API allowed origins") so sign-in works from production.
2. Sanity-check `<api-url>/system.version` and the version footer in the app —
   a commit mismatch means a half-landed deploy.
3. **Point Clerk at the worker.** Dashboard → Webhooks → add an endpoint at
   `<worker-url>/ingest/clerk` (the deploy prints it) and subscribe to:
   `user.created`, `user.updated`, `organization.created`,
   `organization.updated`, `organizationMembership.created`,
   `organizationMembership.updated`, `organizationMembership.deleted`.
   Copy the `whsec_…` signing secret into `packages/worker/.env` **before** the
   first deploy, or hand it in as `CLERK_WEBHOOK_SIGNING_SECRET=… ./deploy.sh`.
   Use "Send test event" and confirm a 2xx in Clerk's delivery log.
4. Confirm the chain end to end: `gcloud run services logs read vendpire-worker`
   should show the ingest line, then the Cloud Tasks callback on `/tasks/…`,
   then `job succeeded`. `curl -X POST <worker-url>/tasks/syncUser -d "{}"`
   must answer **403** — that proves the OIDC guard is closed.

## Continuous deployment

Deploys run from GitHub Actions on the tag `release-please` creates. The full
design, and why all three services ship together rather than only what changed,
is in `docs/plans/2026-10-06-cicd-pipeline.md`.

```
PR ──> ci.yml (lint · typecheck · test · e2e)
   ──> merge to main
   ──> release-please opens a standing release PR
   ──> you merge it  ──> tag vX.Y.Z  ──> deploy.yml  ──> ./deploy.sh
```

Merging the release PR is the only human decision point. `deploy.yml` then runs
this same `deploy.sh`, so there is exactly one deploy path to reason about.

### One-time CI setup

```sh
./scripts/setup-ci-auth.sh
```

Run it locally as project owner. It creates the Workload Identity Federation
pool, provider, and `github-deployer` service account, applies the Artifact
Registry cleanup policy, and sets the two repo variables `deploy.yml` reads. It
is idempotent — re-run it after changing any role.

No service account key is ever created. GitHub mints a short-lived OIDC token
that GCP trades for ~1h credentials, and the provider's attribute condition pins
it to `jmoyers14/vendpire`, so no other repository can use it.

### GitHub secrets

Run `./scripts/set-github-secrets.sh`. It pipes what it can out of your local
`.env` files straight into `gh secret set` over stdin — values are never
printed, never passed as argv, never written to a temp file — and prompts for
the e2e test user, which lives in no local file.

It deliberately **skips** rather than sets empty for anything missing. An empty
GitHub secret is worse than an absent one: the workflow injects `""`, and
consuming code sees a present-but-blank variable. That is precisely what broke
the e2e job — `fixtures.ts` used `??`, which does not treat `""` as missing.

**Scoping matters for the future production split.** Deploy secrets go to the
GitHub *environment* `staging`, not the repository; e2e secrets stay
repository-level.

That is not cosmetic. Repository secrets are inherited as defaults by every
environment, so a `production` environment added later would silently fall back
to the staging values and ship production built against the **dev** Clerk
instance, with no error anywhere. Scoped per environment, a missing production
override arrives as `""` and `deploy.sh` refuses to start. Adding production is
then `DEPLOY_ENV=production ./scripts/set-github-secrets.sh` — same secret
names, different values, which is the whole point of not suffixing names.

The e2e secrets stay repository-level because `ci.yml`'s e2e job declares no
`environment:`, and a job without one cannot read environment secrets at all.

| Secret | Used by | Scope | Sensitive? |
|---|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | deploy | env `staging` | No — `pk_` is public |
| `POSTHOG_API_KEY`, `POSTHOG_HOST` | deploy | env `staging` | No — write-only ingestion |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | deploy | env `staging` | No |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | e2e — Clerk **dev** instance | repository | Yes, dev only |
| `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD` | e2e test user | repository | Yes, dev only |

No production secrets live in GitHub. The Atlas URI, the production Clerk `sk_`,
and the webhook signing secret stay in Secret Manager.

**On PostHog:** `deploy.sh` treats these as optional and ships without analytics
if they are missing. As of 2026-10-18 they are configured nowhere — not in
`packages/api/.env`, not in `packages/web/.env.local`, not on the deployed api
(whose env is ENVIRONMENT, WEB_URL, CLERK_SECRET_KEY, MONGODB_URI,
GOOGLE_MAPS_API_KEY), and no `phc_` key appears in the live web bundle. So there
is nothing for CI to lose here; analytics has simply never been wired. If you do
configure it, add it to BOTH the local `.env` and the GitHub secret, or laptop
and CI deploys will disagree.

### Remaining manual steps

- Branch-protect `main`, requiring the `check` and `e2e` status checks. A
  workflow file cannot do this; it is a repository setting.
- Actions settings → require approval for all external contributors. The repo is
  public, so anyone can open a PR.

### Deploying by hand

`deploy.sh` still works unchanged from your laptop — the CI branch only skips
the gcloud-configuration guard, which has no meaning on a runner. To re-deploy
an existing tag without a new release, use the `deploy` workflow's
`workflow_dispatch` with a `ref`.

## Adding a new configuration value

Which path depends on **when the value is needed**, not on how sensitive it is.
`vendpire-web` is static files served by nginx — there is no server process to
read an env var — so anything the browser needs must be compiled into the bundle
at build time, and therefore can never be secret.

### A. Backend secret (sensitive, read at runtime)

1. `deploy.sh` — add a `*_SECRET_NAME` constant alongside the others.
2. `deploy.sh` — `ensure_secret "$NEW_SECRET_NAME" NEW_ENV_VAR`. Creates it on
   first run and grants the runtime service account access. Idempotent after.
3. `deploy.sh` — append to `API_SECRETS` (or the worker's `--set-secrets`).
4. Code — a zod config slice modelled on
   `packages/platform/src/integrations/auth/clerkConfig.ts`, registered in the
   container.
5. `packages/api/.env` (or `packages/worker/.env`) for local dev.
6. First deploy only: `NEW_ENV_VAR="..." ./deploy.sh`. Afterwards plain
   `./deploy.sh` — the value lives in Secret Manager.

### B. Frontend value (build time, public by definition)

Seven places. Miss any and it fails silently.

1. `packages/web/Dockerfile` — `ARG VITE_FOO` + `ENV VITE_FOO=$VITE_FOO`,
   **above** `RUN bun run --cwd packages/web build`.
2. `deploy.sh` — read it env-first with a `.env.local` fallback, matching
   `CLERK_PUBLISHABLE_KEY`.
3. `deploy.sh` — `--build-arg VITE_FOO="$FOO"` on the web `docker build`.
4. `packages/web/src/vite-env.d.ts` — add the field to `ImportMetaEnv`.
5. `gh secret set VITE_FOO --repo jmoyers14/vendpire`.
6. `.github/workflows/deploy.yml` — add to the Deploy step's `env:` block.
7. `packages/web/.env.local` for local dev.

Step 6 is the one that gets forgotten: set locally, absent in CI, and the
deployed bundle quietly ships without it.

### C. Backend non-secret (runtime)

Add it to the service's `--set-env-vars`, add a zod slice, add it to the local
`.env`, redeploy.

Note the two styles already in `deploy.sh`: the API passes one comma-joined
string, the worker repeats the flag. Both work. What matters is `--set-env-vars`
**replaces** the whole env block while `--update-env-vars` merges — which is why
the `WORKER_URL` correction uses the latter.

### Why backend mistakes are cheaper than frontend ones

`parseConfig` exits the process on a schema violation, so a missing required
backend value kills the container at startup and Cloud Run refuses to serve the
revision. You find out at once.

A missing `VITE_*` is just `undefined` in the bundle — no error, no crash, the
feature silently does nothing. Prefer required zod fields on the backend, and
treat the frontend checklist above as the real safeguard.

## Rollback

Cloud Run retains revisions, so rolling back is traffic-shifting — no rebuild,
no new image:

```sh
gcloud run revisions list --service vendpire-api --region us-central1
gcloud run services update-traffic vendpire-api \
  --to-revisions=<prior-revision>=100 --region us-central1
```

**Roll back all three services together.** They ship as one version, so a
partial rollback recreates exactly the skew the single-version design exists to
avoid. Repeat for `vendpire-web` and `vendpire-worker`.

This works even after the Artifact Registry cleanup policy has pruned an old
image: revisions are retained independently of image tags.

Then confirm `<api-url>/system.version` and the app footer agree on the version
you rolled back to. A mismatch between services means the rollback is half-done.

## Secrets (Secret Manager)

| Secret Manager name | Contents |
|---|---|
| `clerk-secret-key` | Clerk `sk_test_...` — **dev instance**, see the staging note above |
| `mongodb-uri` | Atlas connection string (from `MONGODB_URI` env on first run) |
| `google-maps-api-key` | Places key (optional — address autocomplete) |
| `clerk-webhook-signing-secret` | Clerk `whsec_...` for the **dev** instance's endpoint |

To rotate one: `gcloud secrets versions add <name> --data-file=-`, then
redeploy.

**When the value is actually read:** not at deploy time. `--set-secrets` only
records a *reference* (`CLERK_SECRET_KEY=clerk-secret-key:latest`) on the
revision. Cloud Run resolves it at **instance startup**, via the runtime service
account — if retrieval fails the instance does not start. The deploy pipeline
never handles these values; `github-deployer` wires up the pointer and grants
access, and the runtime SA does the reading.

That means rotation has a window: instances already warm keep the old value until
they are replaced, and because services scale to zero a rotated `:latest` can get
picked up by the next cold start with no redeploy at all. Redeploy to make the
cutover deterministic rather than whenever an instance happens to recycle.

Google recommends pinning a version rather than `:latest` for environment-variable
secrets, for exactly this reason. All four here use `:latest` — a known gap, not
an oversight.

## Notes

- Images are tagged `:latest` *and* `:<git-sha>`; the deploy refuses nothing on
  a dirty tree but stamps `-dirty` so it's visible in the footer.
- PostHog keys are optional; the deploy prints whether analytics is wired.
- The e2e suite is not part of `deploy.sh` — `ci.yml` runs it on every PR
  instead. Run `bun run test:e2e` locally before a hand deploy that skipped CI.
- The worker image deliberately **runs from TypeScript source**, not a bundle:
  `@google-cloud/tasks` loads JSON config via a runtime `require` that
  `bun build` doesn't emit. That's why the worker has no `build` script.
- The worker is `--allow-unauthenticated` by necessity (Clerk's sender has no
  Google credential, and Cloud Run IAM can't gate one path). Its guards are
  in-app: the svix signature on `/ingest/clerk`, and an OIDC check on
  `/tasks/*`. Do not "tighten" this with IAM — it would break webhooks.
- `WORKER_URL` is both the OIDC audience the queue signs for and the base it
  posts to. On a true first deploy it's a placeholder, corrected immediately
  after with `--update-env-vars` (never `--set-env-vars`, which replaces the
  whole env block).
