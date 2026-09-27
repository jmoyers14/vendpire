#!/bin/bash
set -euo pipefail

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
API_IMAGE="$REGISTRY/api:latest"
WEB_IMAGE="$REGISTRY/web:latest"
CLERK_SECRET_NAME="clerk-secret-key" # Secret Manager secret holding the Clerk sk_ key
MONGO_SECRET_NAME="mongodb-uri"      # Secret Manager secret holding the Atlas connection string

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

API_ENV_EXTRA=()
if [ -n "$POSTHOG_API_KEY_VALUE" ]; then
  PH_ENV="POSTHOG_API_KEY=$POSTHOG_API_KEY_VALUE"
  [ -n "$POSTHOG_HOST_VALUE" ] && PH_ENV="$PH_ENV,POSTHOG_HOST=$POSTHOG_HOST_VALUE"
  API_ENV_EXTRA=(--set-env-vars "$PH_ENV")
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
  local secret_name="$1" env_var="$2"
  if ! gcloud secrets describe "$secret_name" --project "$PROJECT" >/dev/null 2>&1; then
    echo "Creating Secret Manager secret: $secret_name"
    local value="${!env_var:-}"
    if [ -z "$value" ] && [ "$env_var" != "MONGODB_URI" ]; then
      value=$(grep -E "^$env_var=" packages/api/.env 2>/dev/null | head -1 | cut -d= -f2- || true)
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
  --set-env-vars ENVIRONMENT=production \
  --set-env-vars WEB_URL="$API_WEB_URL" \
  "${API_ENV_EXTRA[@]+"${API_ENV_EXTRA[@]}"}" \
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
  gcloud run services update "$API_SERVICE" \
    --project "$PROJECT" \
    --region "$REGION" \
    --set-env-vars WEB_URL="$WEB_URL" >/dev/null
fi

echo ""
echo "Deploy complete: v$APP_VERSION ($GIT_SHA)"
echo "  API: $API_URL"
echo "  Web: $WEB_URL"
echo ""
echo "Reminder: add $WEB_URL to Clerk's allowed origins if you haven't."
