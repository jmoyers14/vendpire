# Deploying vendpire

Two Cloud Run services on the **personal** Google account, isolated from the
work account via a dedicated gcloud *configuration* (same pattern as landscape).

- `vendpire-api` — Bun tRPC server (port 8080)
- `vendpire-web` — React build served by nginx (port 8080)

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

## Secrets

| Secret Manager name | Contents |
|---|---|
| `clerk-secret-key` | Clerk `sk_...` (sourced from `packages/api/.env` on first run) |
| `mongodb-uri` | Atlas connection string (from `MONGODB_URI` env on first run) |

To rotate one: `gcloud secrets versions add <name> --data-file=-`, then
redeploy (Cloud Run resolves `:latest` at deploy time).

## Notes

- Images are tagged `:latest` *and* `:<git-sha>`; the deploy refuses nothing on
  a dirty tree but stamps `-dirty` so it's visible in the footer.
- PostHog keys are optional; the deploy prints whether analytics is wired.
- The e2e suite is not part of deploy — run `bun run test:e2e` before deploying.
