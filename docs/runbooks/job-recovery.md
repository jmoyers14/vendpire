# Runbook — recovering webhook and job failures

What to do when a Clerk event didn't become a `users` / `organizations` /
`organizationmemberships` row, or a queued job is stuck.

For how the pipeline works, see `docs/diagrams/webhook-ingestion.md`. This file
is only about what to do when it doesn't.

> **The one thing worth internalising:** every handler is idempotent by
> construction, and the four dedup layers mean a replay converges rather than
> duplicates. Re-driving work is the *safe* default here. When in doubt, replay.

## The custody model

At any instant one durable party owns the work, and a failure hands it
backwards rather than dropping it:

| Custodian | Holds it for | Hands off when |
|---|---|---|
| Clerk | ~a day of backoff retries | we answer 2xx |
| Cloud Tasks | queue retry policy (gcloud defaults today) | the callback answers 2xx |
| the `jobs` row | forever — **nothing watches it** | a human acts |

Recovery is therefore always one question: **which custodian still has it?** If
Clerk or Cloud Tasks does, you usually wait. If only the job row does, you act.

## Step 1 — triage

### Is the worker even healthy?

```sh
curl -s "$WORKER_URL/health"          # {"status":"ok"}
gcloud run services logs read vendpire-worker --region us-central1 --limit 50
```

### What does Clerk think happened?

Clerk dashboard → Webhooks → your endpoint → **Message Attempts**. This is
authoritative for anything that never reached us, and it has a **Replay**
button. Non-2xx responses are retried on a backoff schedule spanning roughly a
day; after that the delivery is failed and only a manual replay will move it.

### What do our logs say?

Cloud Run parses our JSON stdout, so every field below is directly queryable in
Cloud Logging:

| Query | Means |
|---|---|
| `jsonPayload.message="rejected webhook with invalid signature"` | never got past verification — nothing was persisted |
| `jsonPayload.sourceEventId="msg_2abc"` | everything that happened to one delivery |
| `jsonPayload.dedupKey="clerk:msg_2abc"` | everything that happened to its job |
| `jsonPayload.message="recorded webhook with no route; ignoring"` | recorded for audit, deliberately not acted on |
| `jsonPayload.message="job is poison; acking"` | permanent failure, will not retry |
| `jsonPayload.message="job failed; will retry"` | transient, Cloud Tasks is still on it |

### What does the database say?

Against the app database (Atlas Data Explorer, or a script):

```js
// Everything that failed, worst first.
db.jobs.find({ status: "failed" }).sort({ updatedAt: -1 })

// Possibly orphaned: queued long ago, never ran.
db.jobs.find({ status: "pending", updatedAt: { $lt: new Date(Date.now() - 15*60*1000) } })

// Possibly orphaned: started, never finished.
db.jobs.find({ status: "running", updatedAt: { $lt: new Date(Date.now() - 15*60*1000) } })

// The raw event behind a job — job.payload is { source, sourceEventId }.
db.webhookevents.find({ source: "clerk", sourceEventId: "msg_2abc" })

// Did we ever receive it at all?
db.webhookevents.find({ type: "user.created" }).sort({ receivedAt: -1 }).limit(20)
```

### Is the queue backed up?

```sh
gcloud tasks queues describe user-sync-queue --location us-central1
gcloud tasks list --queue user-sync-queue --location us-central1 --limit 20
```

## Step 2 — match the symptom

| Symptom | What it means | Go to |
|---|---|---|
| Clerk shows failed attempts, no `webhookevents` row | never reached us, or we 5xx'd | **P1** |
| Logs show invalid-signature warnings | secret mismatch | **P2** |
| Event row exists, no `jobs` row | crashed between record and enqueue | **P3** |
| Job `pending`, long untouched | task was never enqueued, or the queue lost it | **P4** |
| Job `running`, long untouched | instance died mid-handler | **P5** |
| Job `failed`, `lastError` looks transient | Cloud Tasks may still retry | **P6** |
| Job `failed`, `lastError` is a parse/missing-event error | poison; acked, will never retry | **P7** |
| Event recorded, logged "no route" but should have acted | routing gap, not a failure | **P8** |
| Job `succeeded` but the mirror is wrong | handler bug | **P9** |

## Procedures

### P1 — delivery never landed

Worker was down, mid-deploy, or the database was unreachable (ingestion throws
→ 500 → Clerk retries). Nothing was persisted, so there is nothing to clean up.

1. Fix the underlying cause; confirm `/health` and a recent successful delivery.
2. If Clerk's retries haven't been exhausted, **wait** — it will land on its own.
3. If they have, replay from the Clerk dashboard. Safe: ingestion is idempotent.

### P2 — invalid signature

Almost always a secret mismatch: the dashboard endpoint's `whsec_…` and
`CLERK_WEBHOOK_SIGNING_SECRET` have diverged, usually after a rotation or a
restore into a fresh environment.

1. Compare the Clerk endpoint's signing secret with the deployed value:
   ```sh
   gcloud secrets versions access latest --secret clerk-webhook-signing-secret
   ```
2. If they differ, add a new secret version and redeploy (Cloud Run resolves
   `:latest` at deploy time, so a new version alone changes nothing):
   ```sh
   printf '%s' 'whsec_…' | gcloud secrets versions add clerk-webhook-signing-secret --data-file=-
   ./deploy.sh
   ```
3. Replay the rejected deliveries from the Clerk dashboard.

Rejected deliveries persist **nothing**, so there is no partial state to undo.
A stale signature also means Clerk keeps retrying for ~a day — so fixing the
secret inside that window recovers everything automatically.

### P3 — event recorded, no job row

The process died between `events.record` and `jobs.enqueuePending`.

If Clerk still has retries left, do nothing — replay re-runs `record`
(`$setOnInsert`, so the original payload is preserved) and then
`enqueuePending`. If its retries are spent, replay from the dashboard. Either
path self-heals; this is exactly why nothing short-circuits on `alreadySeen`.

### P4 — job stuck `pending`

The job row was written but the task never made it to Cloud Tasks (the enqueue
threw, and Clerk's retries ran out before it succeeded).

Re-create the task by hand — see **Replaying a job** below. Use the job's
current `attempts` value in the task name.

### P5 — job stuck `running`

An instance died after `markRunning` and before the handler finished.

If Cloud Tasks still has attempts left it will redeliver, and the runner will
re-run it (only `succeeded` short-circuits). If the task is gone, re-create it
as in **P4**. The handler is idempotent, so re-running is safe even if the
previous run got partway through its writes.

### P6 — job `failed`, transient cause

`lastError` says something like a connection reset or a timeout. Cloud Tasks
treats the 500 as retryable and is probably still working on it — check
`gcloud tasks list` for the queue. Fix the underlying cause and let it retry;
re-create the task only once the queue has given up.

### P7 — job `failed`, poison

`lastError` is `raw event missing`, or a zod parse failure. These are acked with
a 200 on purpose: no number of retries can help, so burning the queue's attempts
would only delay the failure becoming visible.

1. Read the raw event to see what shape actually arrived:
   ```js
   db.webhookevents.find({ source: "clerk", sourceEventId: "<from job.payload>" })
   ```
2. `raw event missing` should be impossible (the event is recorded before the
   job is enqueued) — if you see it, something deleted from `webhookevents`.
   Investigate before replaying.
3. A parse failure means Clerk sent a shape the handler's schema rejects. Fix
   the schema, deploy, then replay the job (**P4**). The raw event is still on
   file, so no redelivery from Clerk is needed.

### P8 — recorded but not routed

Not a failure. `routeEvent` returned null, we answered 200, and Clerk correctly
stopped retrying. Either the event type isn't in `ROUTES`
(`packages/worker/src/ingest/eventRouting.ts`), or the endpoint isn't subscribed
to it in the Clerk dashboard.

Add the route (plus a `JOB_TYPES` entry and a handler if it's a new kind of
work), deploy, then **backfill from our own audit trail** — every such event is
already in `webhookevents`. For each one, insert a `jobs` row and create its
task; no Clerk replay required.

### P9 — succeeded but wrong

A handler bug wrote the wrong thing. The job is terminal, so it won't re-run on
its own.

1. Fix and deploy the handler.
2. Flip the job off its terminal state so the runner will pick it up again:
   ```js
   db.jobs.updateOne(
     { jobType: "syncUser", dedupKey: "clerk:msg_2abc" },
     { $set: { status: "failed", lastError: "manual reset — handler bugfix" } }
   )
   ```
3. Re-create the task (**Replaying a job**).

Only ever reset *away from* `succeeded`. Never hand-edit a job **to**
`succeeded` to silence it — that permanently suppresses the work, and the
runner's already-succeeded short-circuit will refuse every future redelivery.

## Replaying a job

The in-app replay path doesn't exist yet, so this is done by creating the task
Cloud Tasks would have created. It exercises the real callback, including the
OIDC guard.

```sh
WORKER_URL=$(gcloud run services describe vendpire-worker \
  --region us-central1 --format 'value(status.url)')

gcloud tasks create-http-task "syncUser_clerk_msg_2abc_1" \
  --queue user-sync-queue \
  --location us-central1 \
  --url "$WORKER_URL/tasks/syncUser" \
  --method POST \
  --header "Content-Type: application/json" \
  --body-content '{"dedupKey":"clerk:msg_2abc"}' \
  --oidc-service-account-email "cloud-tasks-invoker@vendpire-128694.iam.gserviceaccount.com" \
  --oidc-token-audience "$WORKER_URL"
```

Three things have to line up:

- **The queue must match the job type** — see `QUEUES` in
  `packages/platform/src/jobs/jobTypes.ts`.
- **The body is only `{ dedupKey }`.** The job type rides in the URL, which is
  what selects the handler, so the two can't disagree.
- **The task name must be one that has never been used.** It is
  `taskName(jobType, dedupKey, attempts)` — `${jobType}:${dedupKey}:${attempts}`
  with everything outside `[A-Za-z0-9_-]` replaced. Use the job's **current**
  `attempts`; the original run used `…_0`, so the first manual replay is `…_1`.
  Cloud Tasks keeps a name reserved after completion, which is precisely why
  `attempts` is part of it — without that, replaying a failed job would be
  silently refused as a duplicate.

To stop the bleeding while you investigate, pause rather than delete:

```sh
gcloud tasks queues pause  user-sync-queue --location us-central1
gcloud tasks queues resume user-sync-queue --location us-central1
```

## Never do these

- **Don't edit `webhookevents.payload`.** It's the immutable record of what the
  provider actually sent — the thing that makes replay-without-redelivery
  possible. If a handler needs different data, change the handler.
- **Don't hand-set a job to `succeeded`.** See P9.
- **Don't delete a job row to "retry from scratch".** You'll lose the attempt
  history, and a later Clerk redelivery will recreate it at `attempts: 0` and
  re-run work that may already have partially applied.
- **Don't tighten the worker with Cloud Run IAM.** It must stay
  `--allow-unauthenticated`; Clerk's sender has no Google credential. Both
  guards are in-app by necessity.

## Known gaps

These are real and deliberate — the system recovers transient failure well, but
*exhausted* failure is a manual operation today. Tracked as follow-ups:

1. **No alerting.** Nothing notices a growing `failed` count, so every procedure
   above starts with a human already suspecting a problem. Highest value to fix
   first: you cannot act on what you cannot see. A log-based metric on
   `jsonPayload.message="job is poison; acking"` plus a count of `failed` rows
   is most of it.
2. **Retry policy isn't pinned.** `deploy.sh` creates the queues with no flags,
   so they inherit gcloud's defaults (~100 attempts, unlimited duration,
   0.1s→1h backoff). Generous, but implicit — a default change would silently
   alter behaviour. Pin it with `gcloud tasks queues update --max-attempts …
   --max-backoff …`.
3. **There is no dead-letter queue, and there cannot be one.** Cloud Tasks has
   no dead-letter feature (that's Pub/Sub) — when attempts are exhausted the
   task is simply deleted. **The `jobs` table is our dead-letter record**: a
   `failed` row with `lastError` is the letter. That reframes the next item.
4. **No in-app replay.** Re-driving means the `gcloud` incantation above.
   `JobRepository.findByStatus` exists for exactly this and is currently called
   by nothing.
5. **No sweeper.** Nothing periodically finds `pending`-with-no-task or
   `running`-past-deadline rows and re-enqueues them. Combined with (3) and (4)
   this is really one feature, not three: *the jobs table is the dead-letter
   record, so give it a reaper and a replay surface.*
6. **No `running` timeout.** A job legitimately in flight and one orphaned an
   hour ago are indistinguishable, which is what a sweeper would need to tell
   apart before re-enqueueing.
