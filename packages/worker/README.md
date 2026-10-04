# @vendpire/worker

The third Cloud Run service: vendpire's background job-execution home.

It shares the whole backend — repositories, integration adapters, config — with
the api through `@vendpire/platform`, and adds only transport: running work off a
queue, plus the inbound endpoints that enqueue it.

## Surfaces

| Route | Caller | Guard |
|---|---|---|
| `GET /health` | Cloud Run probe | none |
| `POST /ingest/clerk` | Clerk's webhook sender | svix signature (`ClerkWebhookVerifier`) |
| `POST /tasks/:jobType` | Cloud Tasks | OIDC token (`GoogleOidcTaskAuthenticator`) |

The service is deployed `--allow-unauthenticated` because Clerk cannot present a
Google credential, and Cloud Run IAM gates a whole service rather than a path.
Both guards therefore live in the app.

## The pipeline

```
Clerk ──POST──▶ /ingest/clerk
                 1. verify signature         bad ⇒ 400, nothing persisted
                 2. record raw event         (source, sourceEventId) unique
                 3. routeEvent(type)         no route ⇒ 200 "ignored"
                 4. jobs.enqueuePending      job row BEFORE the task
                 5. queue.enqueue            deterministic task name
                ◀───── 202 "queued"

Cloud Tasks ──POST──▶ /tasks/:jobType
                 OIDC guard ▶ JobRunner ▶ registry.get(jobType) ▶ handler
                ◀───── 200 (done/poison) or 500 (retry)
```

Four independent layers make a redelivery harmless: the unique index on
`webhookevents`, `$setOnInsert` on `jobs`, Cloud Tasks' task-name dedup, and the
runner's already-succeeded short-circuit. The handlers are idempotent on top of
all that, because the queue only promises at-least-once.

## Not "the webhook service"

Webhook ingestion is the first workload here, not the only intended one. A
future Cantaloupe CSV import or a scheduled report rollup belongs here too, as a
new handler family under `src/jobs/handlers/` plus a `JOB_TYPES` entry — no new
package.

## Local development

`ENVIRONMENT=local` swaps Cloud Tasks for `InlineTaskQueue`, which POSTs tasks
straight back to `/tasks/*` over localhost — the same HTTP hop, so the route,
the runner, and the registry all run exactly as they will in production. It
provides no retries and refuses to start outside local for that reason.

```sh
bun run dev        # port 3211, beside the api's 3210
```

See `.env.example`. There is deliberately **no build script**: the Dockerfile
runs from TypeScript source (see the comment there for why bundling breaks).
