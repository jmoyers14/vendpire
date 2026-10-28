# Runbook — recovering a stuck iOS outbox row

What to do when a visit or purchase captured on the phone isn't reaching the
server.

For how the pipeline works, see `docs/diagrams/visit-capture.md`. This file is
only about what to do when it doesn't.

> **The one thing worth internalising:** a row leaves the queue on success and
> no other way. Nothing here is ever lost silently — a stuck row is either
> still trying, or sitting in `needsAttention` with the server's own words on
> it, or (for a purchase only) explicitly discarded by a person. When in
> doubt, open **Account → Waiting to sync** before doing anything else.

## Scenario 1 — a row stuck in `needsAttention`

### Symptoms

Account → Waiting to sync shows a row under **Needs attention**, with a
message underneath it and a **Retry** button. It has stopped retrying on its
own — `OutboxSubmitter` only auto-retries `retryable`, `unauthorized`,
`noOrganization`, and `blockedByUpdateFloor` outcomes; `needsAttention` comes
from a 400 or 404, which `SubmitOutcome.forFailure` treats as permanent on
purpose, and a permanent outcome is never re-attempted without a person
tapping something.

### Diagnosis

The message **is** the server's rejection, verbatim — `OutboxItem.lastMessage`
is shown with no paraphrasing, the same rule that keeps the webhook runbook's
job errors readable. Common causes: a referenced machine, product, or
planogram was deleted in a way the deleted-tolerant checks don't cover, a slot
code no longer exists on the machine, or (rarer) a genuine bug in what the
phone built.

### Fix — visit rows

**Retry** re-sends the exact bytes already stored — it does not re-read the
draft. That makes it the right button when the cause was external and has
since been corrected (for example, the missing product was restored on web):
tap Retry, and the same captured counts go through unchanged.

There is **no Discard for a visit row** in this build — the button only
appears when `item.kind == "purchase"` (`OutboxReviewView.swift`). The
`VisitDraft` behind a stuck visit is never deleted by a failed submit, so the
counts are never lost, but there is also no screen that re-opens that specific
draft for editing. If the counts themselves need correcting, service the
machine again: **Start visit** mints a fresh `clientRequestId` rather than
resuming the flagged one, because `VisitCaptureService.openDraft` treats any
draft that already has an `OutboxItem` — in any status — as no longer open.
The original stuck row stays visible under Needs attention until it either
succeeds (the cause gets fixed and Retry is tapped again) or is cleaned up by
hand against the database — there is no in-app way to make it disappear
outside of a successful submit. Treat a recurring visit `needsAttention` row
as worth escalating, not retrying forever.

### Fix — purchase rows

A purchase has no draft entity — `PurchaseLogModel` holds its lines only in
memory, and Save encodes them straight into the `OutboxItem`'s payload, so
there is nothing to go back and edit. Read the message, tap **Discard**
(purchase rows only), and log the purchase again from **Log Purchase**. This
is the one case where the app deletes a row on a person's say-so rather than
on success — it is still never silent: Discard is a deliberate, visible tap.

**The rule either way: the app never deletes a row itself.** Only a
successful submission or an explicit Discard removes one.

## Scenario 2 — a lapsed Clerk session with pending rows

### Symptoms

Rows sit in Waiting to sync without advancing. Account shows **Signed out**
with a **Sign In** link underneath — not a blocking screen. `RootView` gates
on whether an organization has ever been mirrored, not on auth state, so
everything the phone already has stays fully usable while signed out; sign-in
is somewhere you navigate to, never something you're stuck behind.

### Diagnosis

Nothing is lost, and nothing is stuck-forever. Every outbound request stamps
a freshly fetched Clerk token (`AuthTokenMiddleware` — no caching, since the
token's TTL is 60 seconds), so a 401 here is a real lapsed session, not a
timing fluke. `OutboxSubmitter` classifies `.unauthorized` exactly like a
retryable failure: same exponential backoff with jitter, same cap at one hour
(`backoffDelay` in `SubmitOutcome.swift` — `base: 30s`, `cap: 3600s`), and it
never touches the row's draft. Left alone, it will keep trying forever at an
hourly cadence and pick up the moment a valid session exists again.

### Fix

Account → Sign In. Signing back in fires an immediate refresh and drain on
its own (`VendpireApp.swift`'s `.onChange(of: session.isSignedIn)`) — nothing
else is required. If a drain doesn't visibly happen, foregrounding the app
does the same thing (`scenePhase == .active`), and so does the 30-second
background loop that runs while the app is open. Reopen Waiting to sync and
confirm it empties to "Everything has synced."

## Scenario 3 — confirming a submission landed exactly once

### On the web

`/purchases` (or a machine's visit history) should show exactly one row for
the thing that was captured. If a row vanished from the phone's outbox after
a retry, that disappearance **is** the proof it landed — not a hint that it
might have landed twice.

### On the server

The guarantee is the unique index on `(orgId, clientRequestId)` —
`Visit.ts:106` and `Purchase.ts:52` both declare it, and both fields are
`required`, which is what makes a plain (non-partial) unique index safe on
each collection. A resubmission of the same `clientRequestId` resolves to a
`E11000` on insert, the service re-reads, and returns the **original**
document with a 200 — never a 409. That response is exactly what
`VendpireAPIClient+Outbox.swift` treats as `.accepted`, which is why a retried
item disappearing from the queue means success, not a duplicate.

To confirm directly, nothing should ever group to more than one document per
request id:

```bash
mongosh vendpire --eval 'db.purchases.aggregate([{ $group: { _id: "$clientRequestId", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])'
```

(expected output: nothing.) The same check works for visits:

```bash
mongosh vendpire --eval 'db.visits.aggregate([{ $group: { _id: "$clientRequestId", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])'
```

## Never do these

- **Don't expect Retry to pick up an edited draft.** It resends the stored
  payload byte-for-byte. If the capture itself was wrong, there is no in-app
  fix for a visit in this build — see Scenario 1.
- **Don't hand-edit `OutboxItem.payload` or `status` in the database as a
  "fix."** The payload is the app's own stable `Codable` shape plus a
  `schemaVersion`, built to survive the app updating out from under a pending
  row — editing it by hand outside that contract is exactly the silent
  corruption the schema version exists to avoid.
- **Don't treat a signed-out banner as data loss.** The store, the drafts, and
  the queue are all local and keep working; only the network leg is blocked.

## Known gaps

1. **No Discard for a stuck visit.** A purchase row can always be abandoned by
   hand; a visit row cannot, so a permanently unrecoverable visit (for
   instance, a hard-deleted machine) has no in-app way to clear itself. The
   draft survives, which avoids data loss, but it also means the row is
   visible in Needs attention indefinitely.
2. **No in-app way to edit a flagged visit's counts.** Revisiting the machine
   starts an unrelated fresh draft rather than reopening the one that failed,
   so the only lever on a stuck visit today is Retry plus fixing whatever the
   server's message points at.
