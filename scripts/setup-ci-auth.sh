#!/bin/bash
#
# One-time setup so GitHub Actions can deploy without a stored credential.
#
# Run this LOCALLY, as project owner — not from CI. It is idempotent, so a
# re-run is safe and is the right move after changing any role below.
#
# What it creates:
#   1. A Workload Identity Federation (WIF) pool + OIDC provider that trusts
#      GitHub's token
#      issuer, pinned by attribute condition to this one repository.
#   2. A `github-deployer` service account with the roles deploy.sh needs.
#   3. The binding that lets the repo impersonate that service account.
#   4. An Artifact Registry cleanup policy — the only thing in this stack that
#      would otherwise cost money (see the cost note at the bottom).
#
# Nothing secret comes out of this. The provider resource name and service
# account email are both public values; the attribute condition is what makes
# them useless to any other repository.
set -euo pipefail

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# Mirrors deploy.sh — keep these in sync.
CONFIG="vendpire"
PROJECT="vendpire-128694"
ACCOUNT="jmoyers14@gmail.com"
REGION="us-central1"
REPO="vendpire"

GITHUB_REPO="jmoyers14/vendpire"
POOL="github"
PROVIDER="vendpire-repo"
DEPLOYER="github-deployer"
DEPLOYER_SA="${DEPLOYER}@${PROJECT}.iam.gserviceaccount.com"
KEEP_VERSIONS=10

# ── Same guard as deploy.sh: never touch a work project ──────────────────────
echo "Activating gcloud configuration: $CONFIG"
gcloud config configurations activate "$CONFIG" >/dev/null
ACTIVE_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$ACTIVE_ACCOUNT" != "$ACCOUNT" ] || [ "$ACTIVE_PROJECT" != "$PROJECT" ]; then
  echo "ERROR: Active account/project does not match the personal target." >&2
  echo "  expected: $ACCOUNT / $PROJECT" >&2
  echo "  active:   $ACTIVE_ACCOUNT / $ACTIVE_PROJECT" >&2
  exit 1
fi
echo "Setting up CI auth as $ACTIVE_ACCOUNT on $ACTIVE_PROJECT"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format "value(projectNumber)")

# ── APIs ─────────────────────────────────────────────────────────────────────
echo "Enabling APIs..."
gcloud services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  artifactregistry.googleapis.com \
  --project "$PROJECT" --quiet >/dev/null

# ── Workload Identity Pool ───────────────────────────────────────────────────
if ! gcloud iam workload-identity-pools describe "$POOL" \
    --project "$PROJECT" --location global >/dev/null 2>&1; then
  echo "Creating workload identity pool: $POOL"
  gcloud iam workload-identity-pools create "$POOL" \
    --project "$PROJECT" --location global \
    --display-name "GitHub Actions" >/dev/null
else
  echo "Workload identity pool $POOL already exists."
fi

# ── OIDC provider ────────────────────────────────────────────────────────────
# The attribute condition is the security boundary. Without it, ANY GitHub repo
# on the internet could mint a token this provider accepts. With it, only
# $GITHUB_REPO can — which is why the provider name below is safe to commit.
PROVIDER_ARGS=(
  --project "$PROJECT" --location global --workload-identity-pool "$POOL"
  --display-name "$GITHUB_REPO"
  --issuer-uri "https://token.actions.githubusercontent.com"
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref"
  --attribute-condition "assertion.repository == '${GITHUB_REPO}'"
)
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
    --project "$PROJECT" --location global --workload-identity-pool "$POOL" >/dev/null 2>&1; then
  echo "Creating OIDC provider: $PROVIDER"
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    "${PROVIDER_ARGS[@]}" >/dev/null
else
  # Update rather than skip, so re-running this script after editing the
  # condition or mapping actually applies the change.
  echo "Updating OIDC provider: $PROVIDER"
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" \
    "${PROVIDER_ARGS[@]}" >/dev/null
fi

# ── Deployer service account ─────────────────────────────────────────────────
if ! gcloud iam service-accounts describe "$DEPLOYER_SA" --project "$PROJECT" >/dev/null 2>&1; then
  echo "Creating service account: $DEPLOYER_SA"
  gcloud iam service-accounts create "$DEPLOYER" \
    --project "$PROJECT" \
    --display-name "GitHub Actions deployer" >/dev/null
else
  echo "Service account $DEPLOYER_SA already exists."
fi

# deploy.sh does not merely deploy — it bootstraps infrastructure, which is why
# this set is broad. Each role traces to a specific thing the script does:
#
#   run.admin                   gcloud run deploy / services update
#   artifactregistry.writer     docker push (repo creation stays in THIS script,
#                               so CI never needs artifactregistry.admin)
#   secretmanager.admin         add-iam-policy-binding on the four secrets;
#                               no narrower predefined role has setIamPolicy
#   cloudtasks.admin            creating the three job queues
#   iam.serviceAccountAdmin     creating cloud-tasks-invoker + binding to it
#   iam.serviceAccountUser      deploying as the Cloud Run runtime SA
#   serviceusage.serviceUsageAdmin   gcloud services enable
#   browser                     gcloud projects describe (project number lookup)
#
# This is close to project-admin, scoped to one project. The alternative is
# splitting bootstrap out of deploy.sh, which would mean two divergent deploy
# paths that drift — a worse trade for a single-purpose personal project with no
# key to steal. Revisit if this project ever holds anything but vendpire.
# A just-created service account is not immediately visible to the IAM policy
# API, so the first binding after `service-accounts create` can fail with
# "Service account ... does not exist" even though it plainly does. deploy.sh
# already works around the same eventual consistency for the Cloud Tasks service
# agent; this mirrors that loop rather than making you re-run the script.
retryBinding() {
  local description="$1"
  shift
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    if [ "$attempt" = "6" ]; then
      echo "ERROR: $description did not succeed after 6 attempts." >&2
      echo "Re-run this script — it is idempotent and will resume." >&2
      return 1
    fi
    echo "    not visible yet; retrying ($attempt/6)..."
    sleep 5
  done
}

echo "Granting roles to $DEPLOYER_SA..."
for role in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/secretmanager.admin \
  roles/cloudtasks.admin \
  roles/iam.serviceAccountAdmin \
  roles/iam.serviceAccountUser \
  roles/serviceusage.serviceUsageAdmin \
  roles/browser
do
  echo "  $role"
  retryBinding "granting $role" \
    gcloud projects add-iam-policy-binding "$PROJECT" \
      --member "serviceAccount:$DEPLOYER_SA" \
      --role "$role" --quiet
done

# ── Let the repo impersonate the deployer ────────────────────────────────────
# Scoped to attribute.repository, so only $GITHUB_REPO's tokens qualify — not
# every identity in the pool.
PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}"
echo "Binding $GITHUB_REPO to $DEPLOYER_SA..."
retryBinding "binding $GITHUB_REPO to the deployer" \
  gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
    --project "$PROJECT" \
    --member "$PRINCIPAL" \
    --role roles/iam.workloadIdentityUser --quiet

# ── Artifact Registry: the one real cost leak ────────────────────────────────
# deploy.sh tags every image :latest AND :<git-sha>. The SHA tags pin old layers
# alive forever, and the free tier is 0.5 GB — a handful of deploys crosses it.
# Overage is only ~$0.10/GB/month, but it grows monotonically and silently.
#
# Keep policies take precedence over Delete policies in Artifact Registry, so
# this reads as: always keep the newest $KEEP_VERSIONS versions of each image,
# and delete anything else older than 30 days.
#
# Rollback is unaffected: Cloud Run retains revisions independently of whether
# the image tag still exists, and 10 versions covers any realistic window.
echo "Ensuring Artifact Registry repo exists: $REPO"
gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" \
    --repository-format docker --location "$REGION" --project "$PROJECT" \
    --description "vendpire images" >/dev/null

POLICY_FILE=$(mktemp)
trap 'rm -f "$POLICY_FILE"' EXIT
cat > "$POLICY_FILE" <<JSON
[
  {
    "name": "keep-recent-versions",
    "action": { "type": "Keep" },
    "mostRecentVersions": { "keepCount": ${KEEP_VERSIONS} }
  },
  {
    "name": "delete-stale",
    "action": { "type": "Delete" },
    "condition": { "tagState": "ANY", "olderThan": "30d" }
  }
]
JSON

echo "Applying Artifact Registry cleanup policy (keep $KEEP_VERSIONS, delete >30d)..."
gcloud artifacts repositories set-cleanup-policies "$REPO" \
  --project "$PROJECT" --location "$REGION" \
  --policy "$POLICY_FILE" --no-dry-run >/dev/null

# ── Output: the two values deploy.yml reads ──────────────────────────────────
WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"

echo ""
echo "Done. deploy.yml reads these as repository *variables* (not secrets —"
echo "neither value is sensitive):"
echo ""
echo "  WIF_PROVIDER         $WIF_PROVIDER"
echo "  WIF_SERVICE_ACCOUNT  $DEPLOYER_SA"
echo ""

if command -v gh >/dev/null 2>&1; then
  echo "Setting them via gh..."
  gh variable set WIF_PROVIDER --repo "$GITHUB_REPO" --body "$WIF_PROVIDER"
  gh variable set WIF_SERVICE_ACCOUNT --repo "$GITHUB_REPO" --body "$DEPLOYER_SA"
  echo "Set."
else
  echo "gh not found — set them by hand:"
  echo "  gh variable set WIF_PROVIDER --repo $GITHUB_REPO --body '$WIF_PROVIDER'"
  echo "  gh variable set WIF_SERVICE_ACCOUNT --repo $GITHUB_REPO --body '$DEPLOYER_SA'"
fi

echo ""
echo "Still to do by hand (see DEPLOY.md):"
echo "  - Add the deploy + e2e secrets listed in DEPLOY.md"
echo "  - Branch-protect main, requiring the 'check' and 'e2e' status checks"
echo "  - Actions settings: require approval for all external contributors"
