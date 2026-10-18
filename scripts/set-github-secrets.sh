#!/bin/bash
#
# Set the GitHub Actions secrets that ci.yml and deploy.yml read.
#
# Values are piped into `gh secret set` over STDIN — never printed, never passed
# as argv (where `ps` would expose them), never written to a temp file. What can
# be sourced from your local .env files is; the rest is prompted for with the
# terminal echo off.
#
# Idempotent: re-running overwrites with the same values. Safe to re-run after
# adding a key locally.
set -euo pipefail

REPO="jmoyers14/vendpire"
API_ENV="packages/api/.env"
WEB_ENV="packages/web/.env.local"

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

# Read one KEY=value out of a dotenv file. Prints nothing if absent, which the
# callers treat as "skip" rather than "set empty" — an empty GitHub secret is
# worse than a missing one, because the workflow injects "" and the consuming
# code sees a present-but-blank variable. That exact confusion is what broke the
# e2e job (see fixtures.ts on `||` vs `??`).
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
  echo "  set   $name"
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

# ── Sourced from local .env files ────────────────────────────────────────────
CLERK_PK="$(readEnv "$WEB_ENV" VITE_CLERK_PUBLISHABLE_KEY)"
CLERK_SK="$(readEnv "$API_ENV" CLERK_SECRET_KEY)"

echo "deploy.yml:"
# The only deploy secret that is load-bearing: deploy.sh hard-fails without it,
# because the web bundle bakes it in at build time.
setSecret VITE_CLERK_PUBLISHABLE_KEY "$CLERK_PK" "not in $WEB_ENV"

# Optional analytics. Absent everywhere today — the deployed api has no
# POSTHOG_API_KEY and the live bundle carries no phc_ key — so these skip
# cleanly until you actually configure PostHog.
setSecret POSTHOG_API_KEY   "$(readEnv "$API_ENV" POSTHOG_API_KEY)"   "analytics not configured"
setSecret POSTHOG_HOST      "$(readEnv "$API_ENV" POSTHOG_HOST)"      "analytics not configured"
setSecret VITE_POSTHOG_KEY  "$(readEnv "$WEB_ENV" VITE_POSTHOG_KEY)"  "analytics not configured"
setSecret VITE_POSTHOG_HOST "$(readEnv "$WEB_ENV" VITE_POSTHOG_HOST)" "analytics not configured"

# ── e2e: Clerk dev instance + a test user ────────────────────────────────────
# All four are optional. Without them global-setup.ts returns early and the
# browser specs skip themselves, so the api/webhook specs still run — which is
# exactly how the job is green today. Setting them turns the 3 browser specs on.
echo ""
echo "ci.yml (e2e) — optional; without these the 3 browser specs skip:"
setSecret CLERK_PUBLISHABLE_KEY "$CLERK_PK" "not in $WEB_ENV"
setSecret CLERK_SECRET_KEY      "$CLERK_SK" "not in $API_ENV"

echo ""
echo "  The e2e test user is not in any local file. Press Enter to skip both."
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
echo "Done. Current secrets:"
gh secret list --repo "$REPO"
