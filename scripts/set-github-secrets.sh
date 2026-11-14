#!/bin/bash
#
# Set the GitHub Actions secrets that ci.yml and deploy.yml read.
#
# Values are piped into `gh secret set` over STDIN — never printed, never passed
# as argv (where `ps` would expose them), never written to a temp file. What can
# be sourced from your local .env files is; the rest is prompted for with the
# terminal echo off.
#
# Idempotent: re-running overwrites with the same values.
set -euo pipefail

REPO="jmoyers14/zenvend"
API_ENV="packages/api/.env"
WEB_ENV="packages/web/.env.local"

# Deploy secrets are scoped to a GitHub ENVIRONMENT, not the repository:
# repository secrets are inherited by every environment, so a missing override
# would silently ship the e2e (dev) values instead of failing.
#
# The e2e secrets stay repository-level on purpose: ci.yml's e2e job declares no
# `environment:`, and a job without one cannot read environment secrets at all.
DEPLOY_ENV="${DEPLOY_ENV:-production}"

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

# Read one KEY=value out of a dotenv file. Prints nothing if absent, which the
# callers treat as "skip" rather than "set empty" — an empty GitHub secret is
# worse than a missing one, because the workflow injects "" and the consuming
# code sees a present-but-blank variable. That exact confusion broke the e2e job
# (see fixtures.ts on `||` vs `??`).
readEnv() {
  local file="$1" var="$2"
  [ -f "$file" ] || return 0
  grep -E "^${var}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- || true
}

setSecret() {
  local name="$1" value="$2" note="${3:-}"
  if [ -z "$value" ]; then
    echo "  skip  $name${note:+  ($note)}"
    return 0
  fi
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO" >/dev/null
  echo "  set   $name  (repository)"
}

setDeploySecret() {
  local name="$1" value="$2" note="${3:-}"
  if [ -z "$value" ]; then
    echo "  skip  $name${note:+  ($note)}"
    return 0
  fi
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO" --env "$DEPLOY_ENV" >/dev/null
  echo "  set   $name  (env: $DEPLOY_ENV)"
}

promptHidden() {
  local prompt="$1" value=""
  read -rsp "$prompt" value </dev/tty
  printf '\n' >&2
  printf '%s' "$value"
}

promptVisible() {
  local prompt="$1" value=""
  read -rp "$prompt" value </dev/tty
  printf '%s' "$value"
}

echo "Setting Actions secrets on $REPO"
echo ""

# Local .env files hold the DEV instance's keys: right for e2e, wrong for a
# deploy. The deploy key has to be handed in explicitly.
CLERK_PK="$(readEnv "$WEB_ENV" VITE_CLERK_PUBLISHABLE_KEY)"
CLERK_SK="$(readEnv "$API_ENV" CLERK_SECRET_KEY)"
DEPLOY_CLERK_PK="${DEPLOY_CLERK_PUBLISHABLE_KEY:-}"

# Idempotent, and lets a brand-new environment work without a dashboard visit.
gh api -X PUT "repos/$REPO/environments/$DEPLOY_ENV" >/dev/null 2>&1 || true

echo "deploy.yml  (environment: $DEPLOY_ENV)"
# The only load-bearing deploy secret: deploy.sh hard-fails without it, because
# the web bundle bakes it in at build time.
setDeploySecret VITE_CLERK_PUBLISHABLE_KEY "$DEPLOY_CLERK_PK" "set DEPLOY_CLERK_PUBLISHABLE_KEY=pk_live_..."

# Optional analytics. Configured nowhere as of 2026-10-18 — absent from both
# .env files, absent from the deployed api's env, and no phc_ key in the live
# web bundle — so these skip cleanly until PostHog is actually set up.
setDeploySecret POSTHOG_API_KEY   "$(readEnv "$API_ENV" POSTHOG_API_KEY)"   "analytics not configured"
setDeploySecret POSTHOG_HOST      "$(readEnv "$API_ENV" POSTHOG_HOST)"      "analytics not configured"
setDeploySecret VITE_POSTHOG_KEY  "$(readEnv "$WEB_ENV" VITE_POSTHOG_KEY)"  "analytics not configured"
setDeploySecret VITE_POSTHOG_HOST "$(readEnv "$WEB_ENV" VITE_POSTHOG_HOST)" "analytics not configured"

echo ""
echo "ci.yml e2e  (repository-level — that job declares no environment)"
# All optional. Without them global-setup.ts returns early and the browser specs
# skip themselves, so the api/webhook specs still run.
setSecret CLERK_PUBLISHABLE_KEY "$CLERK_PK" "not in $WEB_ENV"
setSecret CLERK_SECRET_KEY      "$CLERK_SK" "not in $API_ENV"

echo ""
echo "  The e2e test user is in no local file. Press Enter to skip both."
echo "  (The web e2e user is jmoyers14+clerk_test_e2e@gmail.com, org admin of"
echo "   'E2E Organization' — visits.spec.ts needs an org membership.)"
E2E_EMAIL="$(promptVisible "  E2E_CLERK_USER_EMAIL: ")"
if [ -n "$E2E_EMAIL" ]; then
  E2E_PASSWORD="$(promptHidden "  E2E_CLERK_USER_PASSWORD (hidden): ")"
  setSecret E2E_CLERK_USER_EMAIL    "$E2E_EMAIL"
  setSecret E2E_CLERK_USER_PASSWORD "$E2E_PASSWORD"
else
  echo "  skip  E2E_CLERK_USER_EMAIL     (browser specs will skip)"
  echo "  skip  E2E_CLERK_USER_PASSWORD  (browser specs will skip)"
fi

echo ""
echo "Done."
echo ""
echo "Repository secrets (every workflow can read these):"
gh secret list --repo "$REPO" 2>/dev/null || true
echo ""
echo "Environment '$DEPLOY_ENV' (only jobs declaring it can read these):"
gh secret list --repo "$REPO" --env "$DEPLOY_ENV" 2>/dev/null || true
