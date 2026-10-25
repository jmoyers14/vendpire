# The visit write path

Second of Phase 8's specs. The first built the queue; this gives it something real to
send and somewhere real to send it. The capture UX is the third.

At the end of this, a visit constructed in a test reaches the server through the real
client and the real queue. No capture screen yet — that is 2b.

## The server is already done

`POST /api/v1/visits` shipped in Phase 4 and went onto `/api/v1` in Phase 6
(`packages/api/src/routers/visits.ts:128`, `operationId: createVisit`). Nothing here
needs backend work.

Idempotency on `clientRequestId` — which the whole outbox design leans on — is
implemented in two layers (`VisitServiceImpl.ts:109`). A cheap read returns the
original verbatim, and a unique index catches two submits that raced past it. The
replay path deliberately does **not** re-validate: a draft that sat offline for a week
still succeeds after its product was retired. That is exactly the case our
retry-forever policy creates.

Out-of-order detection already exists too, by comparing `countedAt` against the
machine's latest visit, which is why the drain stops rather than skipping ahead.

## `VisitSubmission` — transcription, not design

The wire shape is fixed by the server's schema. This is our own `Codable` mirror of it;
the generated type is touched only at the POST.

```swift
nonisolated struct VisitSubmission: Codable, Equatable, Sendable {
    let machineId: String
    let locationId: String
    let planogramId: String?
    let countedAt: Date
    let lines: [VisitSubmissionLine]
    let notes: String?
    let clientRequestId: String
}

nonisolated struct VisitSubmissionLine: Codable, Equatable, Sendable {
    let slotCode: String
    let productId: String
    /// Pre-fill. Never a "count".
    let remaining: Int
    let added: Int
    let removed: Int
    let removedReason: String?
    let priceCents: Int
    let par: Int?
    let bestBy: String?
}
```

Two constraints in the schema that the client has to respect rather than discover:

- **`lines` has `minItems: 1`.** A visit where nothing was counted is a 400, which would
  land in `needsAttention` after a drain rather than being caught where it happened.
  Submit must refuse to enqueue a draft with no counted lines.
- **`removedReason` is a closed enum** — `expired · damaged · recalled · destocked ·
  transferred · null`. A closed enum is safe here in a way it is not on the read path,
  because we choose the values we send. Kept as `String?` in the struct and constrained
  at the picker, so an unfamiliar value from a future build cannot fail to encode.

`bestBy` is carried but unused until the expiration-tracking card lands.

## `VisitDraft` and the lifecycle

```swift
@Model final class VisitDraft {
    #Unique<VisitDraft>([\.clientRequestId])
    var clientRequestId: String
    var machineId: String
    var countedAt: Date          // stamped at Start visit, not at Submit
    var locationId: String       // snapshot: the machine may be moved before syncing
    var planogramId: String?
    var notes: String?
    var lines: [DraftLine]       // Codable value type, like PlanogramSlot
}
```

**The draft carries no status.** Its existence, joined against the queue, is the state:

| | |
|---|---|
| draft, no queue row | open — "Resume visit" |
| draft + queue row | submitted, waiting to sync |
| neither | nothing pending |

That join exists because `OutboxItem` has no `machineId` — the payload is opaque, so the
queue alone cannot say which machine is waiting. Storing the same fact in both places
instead would let them disagree, and a draft reading `sent` while the queue reads
`needsAttention` is how counts go missing.

**One open draft per machine is enforced in the service, not the schema.** A
submitted-but-undrained draft and a newly started one share a `machineId`, which is
allowed: an operator can service the same machine twice before finding signal, and the
drain sends in `countedAt` order regardless. So the uniqueness rule is "one *unsubmitted*
draft per machine", which `#Unique` cannot express.

## Success deletes, and that changes shipped code

`OutboxSubmitter` currently sets `status = "sent"` and keeps the row. That has to become
a delete of **both** rows, matched on `id`:

- the join above is ambiguous otherwise — "draft, no row" would mean either open or
  already synced
- a table of sent rows grows without bound, and the server is the record of what synced

The queue learns that drafts exist **by id, never by shape**; for a purchase the delete
is a no-op. The never-delete invariant is unchanged: success was always the one exit.

Safe under a crash. A row deleted but not saved returns as `sending`, is reclaimed at
the top of the next pass, resubmits, and the server answers with the original visit.

## The network edge

```swift
extension VendpireAPIClient: OutboxSubmitting {
    func submit(_ request: OutboxRequest) async -> SubmitOutcome
}
```

Decode `request.payload` into `VisitSubmission`, map to the generated input, and
`switch` every documented case into a `SubmitOutcome`. A thrown error is `.retryable` —
that is the offline path, and it must never be mistaken for a rejection.

A payload that fails to decode is `.permanent`: the bytes are ours, so a decode failure
is a bug on this side and retrying forever would hide it.

## Triggers

The five from spec 1, deferred until there was something behind them: launch `.task`,
`scenePhase == .active`, `session.isSignedIn`, Submit, and a 30s tick that drains
anything whose `nextAttemptAt` has passed. Same coalescing guard as the mirror.

## Tests

- `VisitSubmission` round-trips through encode and decode unchanged
- The mapping to the generated input preserves every field, including the optionals that
  default to null
- Each documented status becomes the right `SubmitOutcome`; a thrown error is
  `.retryable`; an undecodable payload is `.permanent`
- `.accepted` deletes the queue row **and** its draft; a queue row with no draft still
  deletes cleanly
- A draft with zero counted lines is refused at Submit rather than enqueued
- A second draft at a machine whose previous visit is still queued is allowed
- `countedAt` survives the round trip with its offset intact — the server's pattern
  rejects a bare `Z`-less timestamp

## Out of scope

The capture UX — grid, keypad, context strip, detail sheet, Review (spec 2b, designed in
`docs/superpowers/specs/2026-10-07-ios-visit-capture-design.md`) · the outbox review
screen · where **Start visit** lives, which is blocked on whether the read-only machine
face survives · both field drills, which need a capture screen · purchases.
