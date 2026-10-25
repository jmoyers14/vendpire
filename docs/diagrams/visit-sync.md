# Visit sync — the mirror and the outbox

How the phone's store fills from the server, and how a visit captured in the
field gets back. Two one-way pipes; there is no merge step anywhere.

**Status: designed, not built.** `VendpireAPI` is an empty protocol today.
The downward half lands in Phase 7, the upward half in Phase 8, and the
`/api/v1` routes they call land in Phase 6. Plan of record:
`docs/plans/2026-10-05-visits-and-ios.md`.

## The two pipes

Reference data moves down and is never edited on the phone. Observations move
up and are never edited on the server. No entity travels both ways.

```mermaid
flowchart LR
    subgraph server["server"]
        Api["/api/v1"]
        Mongo[("MongoDB")]
    end

    subgraph phone["phone"]
        Mirror["MirrorRefresher"]
        Capture["VisitCaptureService"]
        Drain["OutboxSubmitter"]

        subgraph store["one SwiftData container"]
            direction TB
            Mirrored["mirrored entities<br/>Location · Machine · Product<br/>Pack · Planogram · StoreMetadata"]
            Pending["VisitDraft · OutboxItem"]
        end
    end

    Views["views — @Query"]

    Api -->|"GET locations, machines, products,<br/>packs, planograms/current, visits/latest"| Mirror
    Mirror -->|"upsert · remove-missing · stamp metadata"| Mirrored
    store -->|"reads only"| Views
    Views -->|"intents: startVisit, submit"| Capture
    Capture -->|"writes the draft, then the OutboxItem"| Pending
    Pending -->|"oldest countedAt first"| Drain
    Drain -->|"POST /api/v1/visits<br/>POST /api/v1/purchases"| Api
    Api --> Mongo
```

Views never write to the store and never touch the network — see
`ios/ARCHITECTURE.md`.

**Pending work is stored, not held.** `VisitDraft` and `OutboxItem` are
SwiftData `@Model`s in the same container as the mirrored entities, so a
force-quit with drafts queued loses nothing. Nothing about a pending submit
lives only in memory.

## Downward — cold launch and refresh

The store renders before the network is consulted, and a failed refresh leaves
the previous contents on screen.

```mermaid
sequenceDiagram
    participant User
    participant Lock as LocalLockGate
    participant Store as SwiftData store
    participant Mirror as MirrorRefresher
    participant Api as /api/v1

    User->>Lock: launch
    Lock->>Lock: biometric / passcode
    Lock->>Store: unlock
    Store-->>User: render immediately, with staleness badge

    par background
        Mirror->>Api: GET the six mirror reads
    end

    alt reachable
        Api-->>Mirror: full org payload
        Mirror->>Store: reconcile
        Store-->>User: rows update via @Query, badge clears
    else offline or 5xx
        Api-->>Mirror: failure
        Mirror->>Store: no writes
        Store-->>User: unchanged — badge keeps the old "as of" date
    end
```

Auth is not consulted on this path until the request itself. `Clerk.load()`
failing on a cold offline launch does not gate the store.

## Downward — what reconcile does

A refresh replaces org state wholesale. There is no cursor and no per-record
merge.

```mermaid
flowchart TD
    Start["refresh returns a full org payload"] --> OrgCheck

    OrgCheck{"payload org ==<br/>StoreMetadata.orgId?"}
    OrgCheck -->|"no"| Wipe["delete every entity,<br/>rewrite StoreMetadata"]
    OrgCheck -->|"yes"| Upsert
    Wipe --> Upsert

    Upsert["upsert each record by id"] --> Remove
    Remove["delete local records<br/>absent from the payload"] --> Images
    Images["queue missing image downloads<br/>→ Caches dir, keyed by URL hash"] --> Stamp
    Stamp["StoreMetadata.lastRefreshedAt = now"]
```

Entity models carry no `orgId` and no query filters by org — the single
`StoreMetadata` row is the only place the org is recorded.

## Upward — a visit's life

`clientRequestId` is minted once, at **Start visit**, and survives every edit.

```mermaid
sequenceDiagram
    participant User
    participant Capture as MachineFace
    participant Draft as VisitDraft<br/>@Model
    participant Item as OutboxItem<br/>@Model
    participant Api as POST /api/v1/visits

    Note over Draft,Item: both are rows in the SwiftData container,<br/>written before any network attempt

    User->>Capture: Start visit
    Capture->>Draft: create — mint clientRequestId, stamp countedAt
    Note over Draft: snapshot from the mirror:<br/>locationId, planogramId,<br/>per-slot productId / priceCents / par

    loop per slot
        User->>Capture: remaining, added, removed + removedReason
        Capture->>Draft: persist each edit
    end

    User->>Capture: Submit
    Capture->>Item: encode the draft struct to payload + schemaVersion
    Note over Item: OutboxItem.id == clientRequestId

    Item->>Api: POST
    Api-->>Item: 200 + visit document
    Item->>Item: mark sent
```

**Corrected 2026-10-24.** This previously said the payload is frozen as bytes
and never re-encoded. The draft is stored as a struct and encoded at submit:
`Remote+Generated.swift` is the only file that knows the generated types, so a
spec change is a compile error there rather than a silent re-encode. Frozen
bytes also made a stuck draft unfixable and were silently wrong under a
semantic change. `schemaVersion` is kept for migration, not for freezing. See
`docs/superpowers/specs/2026-10-24-visit-outbox-design.md`.

## Upward — outbox states

The drain is serial, oldest `countedAt` first, and stops at the first retryable
failure.

```mermaid
stateDiagram-v2
    [*] --> queued: Submit tapped
    queued --> sending: drain picks oldest countedAt
    sending --> sent: 200 — new or existing visit
    sending --> queued: network / timeout / 5xx / 429<br/>backoff + jitter, cap ~1h
    sending --> reauth: 401
    reauth --> queued: token refreshed, or backoff
    sending --> noOrg: 403
    noOrg --> queued: after re-auth
    sending --> needsAttention: 400 / 404
    needsAttention --> queued: user retries after fixing
    sent --> [*]
```

No edge leads out of the machine except `sent`. A draft is never dropped.

### Response routing

| Response | Treatment |
|---|---|
| Network / timeout / 5xx / 429 | retryable; exponential backoff + jitter, cap ~1h, infinite |
| 401 | re-auth once, then back off. Never drop the draft |
| 403 — no org | retryable after re-auth; surface "you're not in an organization" |
| 400 / 404 | permanent → `needsAttention`, listed with the server's message |
| 200 returning an existing visit | success |

## Why a resubmit is harmless

Four layers absorb a duplicate, and the server's answer to one is a 200 with the
original document — never a 409.

```mermaid
flowchart TD
    D["same visit submitted twice<br/>(timeout, relaunch, double tap)"] --> L1

    L1{{"clientRequestId minted at draft creation"}}
    L1 -->|"editing a draft rewrites the payload,<br/>keeps the id"| L2

    L2{{"OutboxItem.id == clientRequestId"}}
    L2 -->|"one row per draft — a second Submit<br/>overwrites, it does not append"| L3

    L3{{"unique index on (orgId, clientRequestId)"}}
    L3 -->|"second insert resolves to the first document"| L4

    L4{{"visits.create"}}
    L4 -->|"200 with the original visit"| R["one visit, one row"]
```

## Server-side rules the outbox depends on

| Rule | Failure if broken |
|---|---|
| Idempotent create returns 200 with the original document, never 409 | The outbox cannot tell "succeeded, response lost" from "failed" — it drops the draft or retries forever |
| Out-of-order / backdated visits are accepted, logged, never rejected | Real field data is destroyed; backdating is normal offline |
| Reference validation ignores `deletedAt` | A soft-deleted product 400s a queued draft permanently and the day's counts are lost |
| Nothing derived is persisted — sold, revenue, COGS and profit compute at read time | A late visit would need a recompute job instead of simply changing what the next read returns |

## Related

| File | Shows |
|---|---|
| `visit-calculations.md` | What the server computes from the visits this pipe delivers |
| `forced-update.md` | `ClientSupportMiddleware` at the same `VendpireAPI` seam |
| `../runbooks/stuck-outbox.md` | Operator recovery (Phase 9) |
