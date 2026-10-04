# Deploying vendpire

Three Cloud Run services on the **personal** Google account, isolated from the
work account via a dedicated gcloud *configuration* (same pattern as landscape).

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

## Secrets

| Secret Manager name | Contents |
|---|---|
| `clerk-secret-key` | Clerk `sk_...` (sourced from `packages/api/.env` on first run) |
| `mongodb-uri` | Atlas connection string (from `MONGODB_URI` env on first run) |
| `google-maps-api-key` | Places key (optional — address autocomplete) |
| `clerk-webhook-signing-secret` | Clerk `whsec_...` (sourced from `packages/worker/.env` on first run) |

To rotate one: `gcloud secrets versions add <name> --data-file=-`, then
redeploy (Cloud Run resolves `:latest` at deploy time).

## Notes

- Images are tagged `:latest` *and* `:<git-sha>`; the deploy refuses nothing on
  a dirty tree but stamps `-dirty` so it's visible in the footer.
- PostHog keys are optional; the deploy prints whether analytics is wired.
- The e2e suite is not part of deploy — run `bun run test:e2e` before deploying.
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
