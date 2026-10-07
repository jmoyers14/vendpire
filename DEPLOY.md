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

| Secret | Used by | Sensitive? |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | deploy | No — `pk_` is public |
| `POSTHOG_API_KEY`, `POSTHOG_HOST` | deploy | No — write-only ingestion |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | deploy | No |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | e2e — Clerk **dev** instance | Yes, dev only |
| `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD` | e2e test user | Yes, dev only |

No production secrets live in GitHub. The Atlas URI, the production Clerk `sk_`,
and the webhook signing secret stay in Secret Manager.

**The PostHog keys are a trap.** `deploy.sh` treats them as optional and ships
without analytics if they are missing, printing a line nobody reads. Laptop
deploys get them from `.env`; CI will not unless you set them above.

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
redeploy (Cloud Run resolves `:latest` at deploy time).

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
