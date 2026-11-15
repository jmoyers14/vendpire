# Zenvend: rename + production cutover

Two changes, done together because they touch the same things:

1. **Rename** Vendpire → Zenvend, in the repo and everywhere a person sees it.
2. **Cutover** from the Clerk dev instance on `*.run.app` to a Clerk production
   instance on `zenvend.app`. The deployed stack already holds the real business
   data, so this is production in everything but name.

Supersedes `2026-11-13-production-cutover.md` and "Adding production later" in
`2026-10-06-cicd-pipeline.md`.

> **Status, 2026-11-15:** cut over. Phases 0–5 and 7 are done; the open boxes
> below are what's left. Next: confirm the first real visit lands in `zenvend`
> (Phase 5 step 7), then Phase 6. The old stack retires around 2026-11-29.


## The shape: build beside, then switch

Nothing gets changed in place. The new stack (`zenvend-*` services, a `zenvend`
database, a Clerk production instance) is built **next to** the old one and
tested while the old one keeps serving. The old stack is never modified, so it
is the rollback.

```
 today                          during                         after
 ─────                          ──────                         ─────
 Vendpire app (iOS)  ──┐        Vendpire app ──> old stack     Zenvend app ──> new stack
 *.run.app web       ──┼─> old  Zenvend app  ──> new stack     zenvend.app ──> new stack
                       │                                       old stack: idle, kept 2 weeks
 dev Clerk, db vendpire         copy data old → new, once
```

### Downtime estimate

| What | Duration | Impact |
|---|---|---|
| Phases 0–4 (domain, rename, new stack, rehearsal) | days, part-time | **None.** The live app is untouched. |
| Phase 5 freeze: no data entry | **~20–30 min** | You can still read the old app. Only new visits/purchases have to wait. |
| Hard outage (app unreachable) | **0** | Old app works until you stop using it. |

The freeze is short because the copy is small (one business, a few MB) and it
has been rehearsed before the real run. Most of the 20–30 min is checking
numbers by eye, not machine time.

The work is front-loaded: DNS and certificate verification (hours, up to 48h)
and the rename PR are the long parts, and neither touches the live app.

### What can go wrong, and the answer

| Risk | Answer |
|---|---|
| A write lands in the old stack after the copy | The verify step compares the latest `updatedAt` per collection, old vs. new, and flags it. Re-run the copy (it replaces the target). |
| Unsent purchases stranded in the old iOS app | Empty the outbox before the freeze (Phase 5, step 1). The new bundle ID means the new app can't see the old app's store. |
| New stack picks up wrong secrets | New secrets get new names (`zenvend-*`). Same-named secrets would leak into the old stack at its next cold start, because `:latest` resolves when an instance starts. |
| Something is wrong after switching | Go back to the old app/URL. It's untouched. Anything entered in the new stack after the switch has to be re-entered (or reverse-copied). |
| Deploys break after the GitHub rename | Workload Identity pins the repo name. Re-run `setup-ci-auth.sh` in the same sitting as the rename. |
| release-please stops tagging | It matches `package-name`. Rename only with no release PR open. |

## Names

| Thing | Old | New |
|---|---|---|
| Domain | — | `zenvend.app` (web), `api.zenvend.app` (api) |
| Cloud Run | `vendpire-api` / `-web` / `-worker` | `zenvend-api` / `-web` / `-worker` |
| Database | `vendpire` | `zenvend` (same Atlas cluster) |
| Secrets | `clerk-secret-key`, `mongodb-uri`, `clerk-webhook-signing-secret`, `google-maps-api-key` | same, prefixed `zenvend-` |
| Clerk | dev `dynamic-kit-6657` | production instance "Zenvend" (dev stays for local + e2e) |
| iOS bundle ID | `com.dogbeach.dev.Vendpire` | `com.dogbeach.dev.Zenvend` |
| Packages, headers, env vars | `@vendpire/*`, `X-Vendpire-Client`, `VENDPIRE_*` | `@zenvend/*`, `X-Zenvend-Client`, `ZENVEND_*` |
| GitHub | `jmoyers14/vendpire` | `jmoyers14/zenvend` |

**Kept on purpose** (nobody sees them, and changing them costs IAM churn):
the GCP project ID `vendpire-128694` (can't change), the Artifact Registry repo
`vendpire`, the gcloud configuration `vendpire`, and the Cloud Tasks queues
(unbranded, shared by both workers; each task carries its own worker's URL).

## Phase 0 — Domain and Clerk (start now; no risk)

DNS is the slow part, so this goes first and runs in the background.

- [x] Buy `zenvend.app`.
- [x] Create the Clerk production instance, named Zenvend, from the dev instance's settings. Check by hand:
  - [x] Organizations on
  - [x] Email + password sign-in, matching dev
  - [x] **Device Trust off** (Configure → Protections). It defaults on and dead-ends iOS sign-in with `needsClientTrust`.
  - [x] Native API on, with the iOS app registered under the **new** bundle ID
  - [x] Allowed origin `https://zenvend.app`
- [x] Add Clerk's DNS records (`clerk.`, `accounts.`, email DKIM) and wait for all of them to verify.
- [ ] Rename the Clerk dev instance's display name and the GCP project display name.

## Phase 1 — Worktree cleanup

- [x] Merge or abandon as many of the 33 worktrees as you can. Every surviving branch has to be rebased over the rename.
- [x] No release PR open (merge or close it). See the release-please risk above.

## Phase 2 — Rename PR (ships to the old stack; no downtime)

Renames the code but leaves every **cloud** name and the **bundle ID** alone, so
it deploys to the existing stack like any other release. The header rename is
safe: a missing client header passes the version gate
(`MobileClientSupportServiceImpl.isUnsupportedRequest`), so the installed
Vendpire app keeps working against the renamed API.

- [x] Branch. `git mv` the iOS folders and files: `ios/Vendpire` → `ios/Zenvend`, the `.xcodeproj`, `VendpireTests`, `VendpireUITests`, the schemes, `VendpireApp.swift`, the `VendpireAPI*` files.
- [x] Run the three case-preserving seds (`Vendpire`/`vendpire`/`VENDPIRE`) across the repo, skipping `CHANGELOG.md`, `bun.lock` and `docs/` history.
- [x] Put back by hand what has to keep the old name for now:
  - [x] `deploy.sh`: service names, secret names, `REPO`, `CONFIG`, `PROJECT` (Phase 3 changes the services and secrets)
  - [x] `scripts/setup-ci-auth.sh`: `CONFIG`, `PROJECT`, `REPO`
  - [x] `ios/Config/*.xcconfig`: bundle ID and the API URL (Phase 3)
  - [x] the database name in any URI
- [x] `bun install`, regenerate the OpenAPI client, `bun run test`, `bun run typecheck`, e2e.
- [x] Build iOS for a device (not the Simulator) and smoke test against local.
- [x] Merge. Ship it through the normal release. Check the live app still works, from the **old** iOS app as well.
- [x] Same sitting: rename the GitHub repo, `git remote set-url origin …`, re-run `scripts/setup-ci-auth.sh` with `GITHUB_REPO="jmoyers14/zenvend"`, and check a no-op CI run goes green.
- [x] Rebase surviving branches (re-running the seds clears most conflicts).

## Phase 3 — Stand up the new stack (no downtime)

- [x] **Cutover PR:**
  - [x] `deploy.sh`: `zenvend-*` services, `zenvend-*` secret names, `DEPLOY_ENVIRONMENT="production"`, `WEB_URL=https://zenvend.app`, `VITE_API_URL=https://api.zenvend.app`. Today both URLs are read from `*.run.app`, which would fail CORS from the domain.
  - [x] `ios/Config/Release.xcconfig`: bundle ID `com.dogbeach.dev.Zenvend`, the `pk_live_` key, `ZENVEND_API_BASE_URL=https://api.zenvend.app/api/v1`.
  - [x] `deploy.yml`: GitHub environment `production`.
  - [x] `DEPLOY.md`: drop the "this stack is staging" callout; new names, webhook and origin steps.
  - [x] The copy script and `db:pull-prod` (below).
- [x] Secrets, new names only: `zenvend-clerk-secret-key` (`sk_live_`), `zenvend-mongodb-uri` (same cluster, database `zenvend`), `zenvend-google-maps-api-key`, and `zenvend-clerk-webhook-signing-secret` (from the next step).
- [x] GitHub environment `production` with `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…` (`DEPLOY_ENV=production ./scripts/set-github-secrets.sh`).
- [x] Merge, then release. **From here on, CI deploys only to the new stack. The old stack stays on its last version, so keep Phases 3–5 to a few days.**
- [x] Cloud Run domain mappings: `zenvend.app` → `zenvend-web`, `api.zenvend.app` → `zenvend-api`. Add the records and wait for the certificates.
- [x] Clerk production → Webhooks: `https://<zenvend-worker-url>/ingest/clerk`, the seven events in `DEPLOY.md`.
- [ ] Maps key: add `https://zenvend.app/*` if it's referrer-restricted.
- [x] Sign up on `https://zenvend.app` (you, then your wife). Create the business, invite her, have her accept. The database is empty, and that's expected.
- [x] Confirm the webhooks filled `users` (2), `organizations` (1) and `organizationmemberships` (2) in `zenvend`. This also proves the worker chain.
- [ ] Install the Zenvend iOS app on both phones (it sits next to Vendpire) and sign in. _Only Jeremy's phone so far; the wife's install waits until she's ready._

## Phase 4 — Rehearse the copy (no downtime)

- [x] Run the copy script dry, then for real, against the live data. The old database is only read.
- [x] Walk the new app: machines, latest visits, purchases, dashboard numbers. Compare with the old app side by side.
- [x] Fix anything, then re-run. The copy replaces the target, so rehearsals are free. _Done 2026-11-15. Source org `org_3L26aFTj0PugW4fkBsAYxTo0KJL` (GetsnackingSD); `GetsnackingSD_Test` intentionally left behind._

## Phase 5 — Freeze and switch (~20–30 min)

1. [x] Both phones: open the **old** app, send everything in the outbox, confirm it's empty.
2. [x] Freeze: no visits or purchases from now until step 6.
3. [x] Back up the `vendpire` database to EJSON, kept off the cluster. _Backup: `~/Backups/vendpire-db-20261115-075324/`._
4. [x] Run the copy script (`--allow-remote-target --apply --replace`).
5. [x] Run its verify mode: counts and latest `updatedAt` per collection match old vs. new. Spot-check in the new app.
6. [x] Switch: bookmark `zenvend.app`, use the Zenvend app. Unfreeze.
7. [ ] Record one real purchase or visit end to end in the new stack.

## Phase 6 — Verify, then retire (over two weeks)

- [x] `https://api.zenvend.app/system.version` says `production`, and the commit matches the footer.
- [x] The web bundle carries `pk_live_`.
- [ ] `bun run db:pull-prod` once, and sign in locally to the copy. Proves the debugging path before you need it.
- [ ] `curl -X POST <zenvend-worker-url>/tasks/syncUser -d "{}"` → 403.
- [ ] Optional, MCP: set `MCP_RESOURCE_URL=https://api.zenvend.app/mcp` and `CLERK_FRONTEND_API_URL=https://clerk.zenvend.app` on `zenvend-api`, register that exact URL under Clerk production → Agents → MCP servers, and turn on DCR (OAuth applications → Settings). `/mcp` stays unmounted until both env vars are set.
- [ ] After two quiet weeks: delete the `vendpire-*` services and the old secrets, remove the dev Clerk webhook that points at the old worker, delete the Vendpire iOS app, and archive the `vendpire` database (drop it once a backup is stored).

## Phase 7 — Local machine

Any time after Phase 2 merges.

- [x] `mv ~/Code/vendpire ~/Code/zenvend`, then `git worktree repair` from the new location.
- [x] Update `.env` files, shell config and `ios/Config/Local.xcconfig` for the renamed env vars.
- [x] Copy the Claude memory folder (`~/.claude-personal/projects/-Users-jeremymoyers-Code-vendpire/`) to the name for the new path.
- [ ] Optional: rename the local database. It's seed data, so it doesn't matter.

## The copy script

`packages/api/scripts/copyBusinessData.ts`. One script, two jobs: the cutover
copy (old database → `zenvend`), and pulling production down to local for
debugging afterward. It reads the source and never writes to it.

```sh
# Cutover (Phases 4–5): old stack → new stack, remapped to the production Clerk instance
bun scripts/copyBusinessData.ts --source "$OLD_URI" --target "$ZENVEND_URI" \
  --target-clerk-key "$SK_LIVE" --allow-remote-target [--apply] [--replace]

# Debugging (any time after): production → local, remapped to the dev Clerk instance
bun run db:pull-prod        # wraps the above: source from Secret Manager, target from packages/api/.env
```

- **Copies** `locations`, `machines`, `machinetemplates`, `packs`, `planograms`, `products`, `purchases`, `visits`, preserving `_id`s so every ObjectId reference still resolves.
- **Rewrites** `orgId` on every document and `visits.recordedByUserId`, from the source's Clerk instance ids to the target's.
- **Builds the mapping by email, with the target's Clerk instance as the answer key:**
  - Source side: the one `orgId` in the source's business collections (stops if there are several; `--source-org` picks one), and each `recordedByUserId`'s email from the source `users` mirror.
  - Target side: each email looked up through the **target instance's Backend API** (`--target-clerk-key`), not the target mirror. Local never receives webhooks, so its mirror can't be trusted to be complete. The target org is the one org every mapped user shares there; `--target-org` overrides.
  - Prints the mapping, and stops if any source id has no match (for example, a test user who recorded a visit).
- **Skips** the mirrors (`users`, `organizations`, `organizationmemberships`) and the history (`jobs`, `webhookevents`).
- **Safety:**
  - Dry run by default; `--apply` writes.
  - Refuses a target with existing documents for the target org unless `--replace`, which deletes **only that org's** documents in the eight collections. Other orgs in the target are untouched, which matters locally, where the seed data holds three.
  - Refuses a non-`localhost` target unless `--allow-remote-target`. Pulling down needs no flag; writing to Atlas always does.
  - Refuses `source == target`.
  - Prints source host/db → target host/db, plus counts, before writing.
- **Verify mode:** per-collection counts and max `updatedAt`, source vs. target, for the target org.
- Indexes come from the API having booted against the target once (Mongoose autoIndex): the new API at Phase 3's sign-up, the local API on any earlier run.

## Local debugging after the cutover

Local web signs in through the dev Clerk instance, and production instances only
accept their own domain, so local can't sign in against production data
directly. Two ways in instead:

1. **Pull a copy (default).** `bun run db:pull-prod`, then run local as usual. Under a minute, shows exactly what you saw, and a bug in local code can't write to real data, which today it can.
2. **Live, iOS only.** A Debug build with `pk_live_` plus a local API with `sk_live_` and the production URI. The native app isn't tied to a domain, so this just works. Writes are real.
   - Web live is possible but deferred: `local.zenvend.app` in `/etc/hosts` and Vite over HTTPS with a local certificate (`.app` forces HTTPS); production instances accept subdomains of their own domain.
