#!/bin/bash
set -euo pipefail

# Never let gcloud stop on an interactive prompt — in a background/CI shell a
# prompt hangs forever. With prompts disabled it errors loudly instead, and
# the missing API/permission gets fixed explicitly.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# ─────────────────────────────────────────────────────────────────────────────
# Personal-account deploy config. These values pin the deploy to the personal
# Google account + project so it can never hit a work project.
# ─────────────────────────────────────────────────────────────────────────────
CONFIG="vendpire"             # gcloud configuration holding the personal account
PROJECT="vendpire-128694"          # personal GCP project ID
ACCOUNT="jmoyers14@gmail.com" # personal Google account email
REGION="us-central1"

REPO="vendpire"               # Artifact Registry repository name
REGISTRY="$REGION-docker.pkg.dev/$PROJECT/$REPO"
API_SERVICE="vendpire-api"
WEB_SERVICE="vendpire-web"
WORKER_SERVICE="vendpire-worker"
API_IMAGE="$REGISTRY/api:latest"
WEB_IMAGE="$REGISTRY/web:latest"
WORKER_IMAGE="$REGISTRY/worker:latest"
CLERK_SECRET_NAME="clerk-secret-key" # Secret Manager secret holding the Clerk sk_ key
MONGO_SECRET_NAME="mongodb-uri"      # Secret Manager secret holding the Atlas connection string
MAPS_SECRET_NAME="google-maps-api-key" # Secret Manager secret holding the Places key (optional)
CLERK_WEBHOOK_SECRET_NAME="clerk-webhook-signing-secret" # the whsec_ key that verifies inbound webhooks

# Cloud Tasks: one queue per job kind. These names MUST match
# packages/platform/src/jobs/jobTypes.ts — a queue missing here means the worker
# enqueues into nothing.
ORG_SYNC_QUEUE="org-sync-queue"
USER_SYNC_QUEUE="user-sync-queue"
ORG_MEMBERSHIP_SYNC_QUEUE="org-membership-sync-queue"
# The identity Cloud Tasks mints OIDC tokens as when it calls /tasks/* back.
TASKS_INVOKER_SA="cloud-tasks-invoker@${PROJECT}.iam.gserviceaccount.com"

# ── Safety guard ─────────────────────────────────────────────────────────────
# Activate the personal configuration and refuse to proceed unless the active
# account + project match exactly. This is what makes mis-deploys impossible.
if [ "$PROJECT" = "REPLACE_ME" ]; then
  echo "ERROR: Set PROJECT at the top of deploy.sh first." >&2
  exit 1
fi

echo "Activating gcloud configuration: $CONFIG"
gcloud config configurations activate "$CONFIG" >/dev/null

ACTIVE_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$ACTIVE_ACCOUNT" != "$ACCOUNT" ] || [ "$ACTIVE_PROJECT" != "$PROJECT" ]; then
  echo "ERROR: Active account/project does not match the personal target." >&2
  echo "  expected: $ACCOUNT / $PROJECT" >&2
  echo "  active:   $ACTIVE_ACCOUNT / $ACTIVE_PROJECT" >&2
  echo "Run the one-time setup in DEPLOY.md, then retry." >&2
  exit 1
fi
echo "Deploying as $ACTIVE_ACCOUNT to $ACTIVE_PROJECT ($REGION)"

# Ensure docker can push to Artifact Registry, and the repo exists (idempotent)
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet >/dev/null
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" \
    --repository-format docker --location "$REGION" \
    --description "vendpire images"

# ── Build stamp ──────────────────────────────────────────────────────────────
# One version identity for this deploy: human semver from the root package.json,
# the git short-SHA of the built commit ("-dirty" if the tree has uncommitted
# changes), and a UTC build timestamp. Injected into both images so the number a
# user reads off the app traces back to exactly this commit.
APP_VERSION=$(grep -m1 '"version"' package.json | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  GIT_SHA="$GIT_SHA-dirty"
fi
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Build stamp: v$APP_VERSION ($GIT_SHA) at $BUILT_AT"

# Tag images by commit as well as :latest, so the running Cloud Run revision, the
# Artifact Registry image, and the git commit are all the same string.
API_IMAGE_SHA="$REGISTRY/api:$GIT_SHA"
WEB_IMAGE_SHA="$REGISTRY/web:$GIT_SHA"
WORKER_IMAGE_SHA="$REGISTRY/worker:$GIT_SHA"

# ── Clerk config (validated up front, before the slow builds) ────────────────
# Publishable key (pk_) is PUBLIC — baked into the web bundle at build time.
# Source of truth is packages/web/.env.local, same as local dev.
CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-$(grep -E '^VITE_CLERK_PUBLISHABLE_KEY=' packages/web/.env.local 2>/dev/null | head -1 | cut -d= -f2- || true)}"
if [ -z "$CLERK_PUBLISHABLE_KEY" ]; then
  echo "ERROR: VITE_CLERK_PUBLISHABLE_KEY not set (env or packages/web/.env.local)." >&2
  exit 1
fi

# ── PostHog analytics config (optional) ──────────────────────────────────────
# PostHog's project key is PUBLIC (write-only ingestion), so — unlike the Clerk
# secret / Mongo URI — it does NOT belong in Secret Manager. The API gets it as
# a plain env var; the web bundle bakes it in at build time. Both are optional:
# without them, analytics simply no-ops and the deploy still works.
POSTHOG_API_KEY_VALUE="${POSTHOG_API_KEY:-$(grep -E '^POSTHOG_API_KEY=' packages/api/.env 2>/dev/null | head -1 | cut -d= -f2- || true)}"
POSTHOG_HOST_VALUE="${POSTHOG_HOST:-$(grep -E '^POSTHOG_HOST=' packages/api/.env 2>/dev/null | head -1 | cut -d= -f2- || true)}"
WEB_POSTHOG_KEY="${VITE_POSTHOG_KEY:-$(grep -E '^VITE_POSTHOG_KEY=' packages/web/.env.local 2>/dev/null | head -1 | cut -d= -f2- || true)}"
WEB_POSTHOG_HOST="${VITE_POSTHOG_HOST:-$(grep -E '^VITE_POSTHOG_HOST=' packages/web/.env.local 2>/dev/null | head -1 | cut -d= -f2- || true)}"

API_ENV_EXTRA=""
if [ -n "$POSTHOG_API_KEY_VALUE" ]; then
  API_ENV_EXTRA=",POSTHOG_API_KEY=$POSTHOG_API_KEY_VALUE"
  [ -n "$POSTHOG_HOST_VALUE" ] && API_ENV_EXTRA="$API_ENV_EXTRA,POSTHOG_HOST=$POSTHOG_HOST_VALUE"
  echo "PostHog analytics key wired into the API (server-side events)."
else
  echo "No PostHog server key found — deploying without server-side analytics."
fi

WEB_POSTHOG_ARGS=()
if [ -n "$WEB_POSTHOG_KEY" ]; then
  WEB_POSTHOG_ARGS+=(--build-arg "VITE_POSTHOG_KEY=$WEB_POSTHOG_KEY")
  [ -n "$WEB_POSTHOG_HOST" ] && WEB_POSTHOG_ARGS+=(--build-arg "VITE_POSTHOG_HOST=$WEB_POSTHOG_HOST")
  echo "PostHog analytics key baked into the web bundle (browser-side events)."
else
  echo "No PostHog web key found — deploying without browser-side analytics."
fi

# Sensitive values (Clerk secret key, Mongo URI) live in Secret Manager and are
# injected at runtime. Create each on first run, then grant the Cloud Run
# runtime service account read access. All idempotent.
#
# NOTE: MONGODB_URI in packages/api/.env points at LOCAL Mongo — the production
# Atlas URI must come from the environment on first run:
#   MONGODB_URI="mongodb+srv://..." ./deploy.sh
gcloud services enable secretmanager.googleapis.com --project "$PROJECT" --quiet >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format "value(projectNumber)")
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

ensure_secret() {
  # $3 is the .env to fall back to, defaulting to the api's. The worker owns its
  # own secrets (the webhook signing key), so it passes packages/worker/.env.
  local secret_name="$1" env_var="$2" env_file="${3:-packages/api/.env}"
  if ! gcloud secrets describe "$secret_name" --project "$PROJECT" >/dev/null 2>&1; then
    echo "Creating Secret Manager secret: $secret_name"
    local value="${!env_var:-}"
    if [ -z "$value" ] && [ "$env_var" != "MONGODB_URI" ]; then
      value=$(grep -E "^$env_var=" "$env_file" 2>/dev/null | head -1 | cut -d= -f2- || true)
    fi
    if [ -z "$value" ]; then
      echo "ERROR: secret '$secret_name' missing and $env_var not provided in env." >&2
      exit 1
    fi
    printf '%s' "$value" | gcloud secrets create "$secret_name" \
      --project "$PROJECT" --replication-policy automatic --data-file=- >/dev/null
  fi
  gcloud secrets add-iam-policy-binding "$secret_name" \
    --project "$PROJECT" \
    --member "serviceAccount:$RUNTIME_SA" \
    --role roles/secretmanager.secretAccessor --quiet >/dev/null
}

ensure_secret "$CLERK_SECRET_NAME" CLERK_SECRET_KEY
ensure_secret "$MONGO_SECRET_NAME" MONGODB_URI

API_SECRETS="CLERK_SECRET_KEY=$CLERK_SECRET_NAME:latest,MONGODB_URI=$MONGO_SECRET_NAME:latest"

# Google Maps key is optional: wire it only if the secret already exists or
# GOOGLE_MAPS_API_KEY is available (env or packages/api/.env). Deploys keep
# working before the address feature is configured.
if gcloud secrets describe "$MAPS_SECRET_NAME" --project "$PROJECT" >/dev/null 2>&1 \
  || [ -n "${GOOGLE_MAPS_API_KEY:-}" ] \
  || grep -qE '^GOOGLE_MAPS_API_KEY=' packages/api/.env 2>/dev/null; then
  ensure_secret "$MAPS_SECRET_NAME" GOOGLE_MAPS_API_KEY
  API_SECRETS="$API_SECRETS,GOOGLE_MAPS_API_KEY=$MAPS_SECRET_NAME:latest"
  echo "Google Maps key wired into the API (address autocomplete)."
else
  echo "No Google Maps key found — deploying without address autocomplete."
fi

# ── API ──────────────────────────────────────────────────────────────────────
# The web URL is stable across deploys, so look it up now and hand it to the API
# from its first revision — no placeholder, no transient wrong-origin window.
# Falls back to a placeholder only on a true first deploy (no web service yet).
EXISTING_WEB_URL=$(gcloud run services describe "$WEB_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format "value(status.url)" 2>/dev/null || true)
API_WEB_URL="${EXISTING_WEB_URL:-https://placeholder.example.com}"
echo "API will trust web origin: $API_WEB_URL"

echo "Building API image..."
docker build --platform linux/amd64 \
  --build-arg APP_VERSION="$APP_VERSION" \
  --build-arg GIT_SHA="$GIT_SHA" \
  --build-arg BUILT_AT="$BUILT_AT" \
  -t "$API_IMAGE" -t "$API_IMAGE_SHA" \
  -f packages/api/Dockerfile .

echo "Pushing API image..."
docker push "$API_IMAGE"
docker push "$API_IMAGE_SHA"

echo "Deploying API to Cloud Run..."
gcloud run deploy "$API_SERVICE" \
  --image "$API_IMAGE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "ENVIRONMENT=production,WEB_URL=$API_WEB_URL$API_ENV_EXTRA" \
  --set-secrets "$API_SECRETS"

API_URL=$(gcloud run services describe "$API_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format "value(status.url)")
echo "API deployed at: $API_URL"

# ── Web ──────────────────────────────────────────────────────────────────────
echo "Building web image..."
docker build --platform linux/amd64 \
  --build-arg VITE_API_URL="$API_URL" \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY" \
  --build-arg VITE_APP_VERSION="$APP_VERSION" \
  --build-arg VITE_GIT_SHA="$GIT_SHA" \
  --build-arg VITE_BUILT_AT="$BUILT_AT" \
  "${WEB_POSTHOG_ARGS[@]+"${WEB_POSTHOG_ARGS[@]}"}" \
  -t "$WEB_IMAGE" -t "$WEB_IMAGE_SHA" \
  -f packages/web/Dockerfile .

echo "Pushing web image..."
docker push "$WEB_IMAGE"
docker push "$WEB_IMAGE_SHA"

echo "Deploying web to Cloud Run..."
gcloud run deploy "$WEB_SERVICE" \
  --image "$WEB_IMAGE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated

WEB_URL=$(gcloud run services describe "$WEB_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format "value(status.url)")
echo "Web deployed at: $WEB_URL"

# ── Correct the API's trusted web origin on a true first deploy ──────────────
if [ "$API_WEB_URL" != "$WEB_URL" ]; then
  echo "Updating API WEB_URL to $WEB_URL..."
  # --update-env-vars merges; --set-env-vars would REPLACE the whole env
  # block and wipe ENVIRONMENT/POSTHOG (bit us on the first deploy).
  gcloud run services update "$API_SERVICE" \
    --project "$PROJECT" \
    --region "$REGION" \
    --update-env-vars WEB_URL="$WEB_URL" >/dev/null
fi

# ── Worker ───────────────────────────────────────────────────────────────────
# The third Cloud Run service and the background job-execution entrypoint: it
# receives Clerk webhooks on /ingest/clerk and runs queued jobs on /tasks/*. It
# talks to Mongo but has no browser caller, so it needs neither the web origin
# nor CORS.

# ── Cloud Tasks infrastructure ───────────────────────────────────────────────
# The worker enqueues jobs to Cloud Tasks, which delivers them back to /tasks/*.
# Set up the queues and the identity those callbacks are authenticated as.
echo "Ensuring Cloud Tasks API + queues..."
gcloud services enable cloudtasks.googleapis.com iamcredentials.googleapis.com \
  --project "$PROJECT" --quiet >/dev/null

for QUEUE in "$USER_SYNC_QUEUE" "$ORG_SYNC_QUEUE" "$ORG_MEMBERSHIP_SYNC_QUEUE"; do
  if ! gcloud tasks queues describe "$QUEUE" \
      --location "$REGION" --project "$PROJECT" >/dev/null 2>&1; then
    echo "Creating Cloud Tasks queue: $QUEUE"
    gcloud tasks queues create "$QUEUE" \
      --location "$REGION" --project "$PROJECT" >/dev/null
  fi
done

# The service account Cloud Tasks mints OIDC tokens as when it calls /tasks/*
# back. The worker verifies each callback was issued as exactly this identity —
# the only thing gating those endpoints on an otherwise-public service.
if ! gcloud iam service-accounts describe "$TASKS_INVOKER_SA" \
    --project "$PROJECT" >/dev/null 2>&1; then
  echo "Creating Cloud Tasks invoker service account..."
  gcloud iam service-accounts create cloud-tasks-invoker \
    --project "$PROJECT" \
    --display-name "Cloud Tasks OIDC invoker for the worker" >/dev/null
fi

# Three grants make OIDC-authenticated callbacks work:
#  1. the worker's runtime SA may enqueue tasks;
#  2. it may act AS the invoker SA (to stamp that identity onto a task's token);
#  3. the Cloud Tasks service agent may mint tokens as the invoker SA at delivery.
echo "Granting Cloud Tasks IAM..."
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:$RUNTIME_SA" \
  --role roles/cloudtasks.enqueuer --quiet >/dev/null

gcloud iam service-accounts add-iam-policy-binding "$TASKS_INVOKER_SA" \
  --project "$PROJECT" \
  --member "serviceAccount:$RUNTIME_SA" \
  --role roles/iam.serviceAccountUser --quiet >/dev/null

# The Cloud Tasks service agent is created when the API is enabled, but can take
# a moment to propagate — retry the token-creator grant rather than aborting the
# whole deploy on a transient "does not exist".
CLOUDTASKS_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
for attempt in 1 2 3 4 5; do
  if gcloud iam service-accounts add-iam-policy-binding "$TASKS_INVOKER_SA" \
      --project "$PROJECT" \
      --member "serviceAccount:$CLOUDTASKS_AGENT" \
      --role roles/iam.serviceAccountTokenCreator --quiet >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" = "5" ]; then
    echo "ERROR: could not grant token-creator to the Cloud Tasks service agent." >&2
    echo "The agent may still be propagating after enabling the API — re-run deploy.sh shortly." >&2
    exit 1
  fi
  echo "  Cloud Tasks service agent not ready; retrying ($attempt/5)..."
  sleep 5
done

# Clerk webhook signing secret (whsec_) — verifies inbound webhook signatures.
# Sourced from packages/worker/.env on first creation, since the worker owns it.
ensure_secret "$CLERK_WEBHOOK_SECRET_NAME" CLERK_WEBHOOK_SIGNING_SECRET packages/worker/.env

echo "Building worker image..."
docker build --platform linux/amd64 \
  --build-arg APP_VERSION="$APP_VERSION" \
  --build-arg GIT_SHA="$GIT_SHA" \
  --build-arg BUILT_AT="$BUILT_AT" \
  -t "$WORKER_IMAGE" -t "$WORKER_IMAGE_SHA" \
  -f packages/worker/Dockerfile .

echo "Pushing worker image..."
docker push "$WORKER_IMAGE"
docker push "$WORKER_IMAGE_SHA"

# The worker needs its own URL as WORKER_URL: it's the OIDC audience the queue
# signs callback tokens for AND the base the queue posts them to. Stable across
# deploys, so look it up and hand it in from the first revision; a placeholder is
# used only on the true first deploy, then corrected right after.
EXISTING_WORKER_URL=$(gcloud run services describe "$WORKER_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format "value(status.url)" 2>/dev/null || true)
WORKER_SELF_URL="${EXISTING_WORKER_URL:-https://placeholder.example.com}"

# --allow-unauthenticated is required: Clerk's webhook sender posts to
# /ingest/clerk with no Google credentials, so Cloud Run IAM can't gate the
# service. The guards live in-app: the svix signature on /ingest/clerk, and the
# Cloud Tasks OIDC token (verified against WORKER_URL + the invoker SA) on
# /tasks/*.
echo "Deploying worker to Cloud Run..."
gcloud run deploy "$WORKER_SERVICE" \
  --image "$WORKER_IMAGE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production \
  --set-env-vars GCP_PROJECT_ID="$PROJECT" \
  --set-env-vars GCP_LOCATION="$REGION" \
  --set-env-vars WORKER_URL="$WORKER_SELF_URL" \
  --set-env-vars TASKS_INVOKER_SERVICE_ACCOUNT="$TASKS_INVOKER_SA" \
  --set-secrets "MONGODB_URI=$MONGO_SECRET_NAME:latest,CLERK_WEBHOOK_SIGNING_SECRET=$CLERK_WEBHOOK_SECRET_NAME:latest"

WORKER_URL=$(gcloud run services describe "$WORKER_SERVICE" \
  --project "$PROJECT" --region "$REGION" --format "value(status.url)")
echo "Worker deployed at: $WORKER_URL"

# First-ever deploy: the URL wasn't known at deploy time, so WORKER_URL held a
# placeholder. Correct it now so the OIDC audience the queue signs matches what
# the worker verifies. --update-env-vars touches only this var, leaving the
# others and the secrets intact.
if [ "$WORKER_URL" != "$WORKER_SELF_URL" ]; then
  echo "Worker URL now known; setting WORKER_URL=$WORKER_URL..."
  gcloud run services update "$WORKER_SERVICE" \
    --project "$PROJECT" --region "$REGION" \
    --update-env-vars WORKER_URL="$WORKER_URL" >/dev/null
fi

echo ""
echo "Deploy complete: v$APP_VERSION ($GIT_SHA)"
echo "  API:    $API_URL"
echo "  Web:    $WEB_URL"
echo "  Worker: $WORKER_URL"
echo ""
echo "Reminder: add $WEB_URL to Clerk's allowed origins if you haven't."
echo ""
echo "Clerk webhook endpoint (configure in the Clerk dashboard -> Webhooks):"
echo "  $WORKER_URL/ingest/clerk"
echo "Subscribe to: user.created, user.updated, organization.created,"
echo "  organization.updated, organizationMembership.created,"
echo "  organizationMembership.updated, organizationMembership.deleted"
