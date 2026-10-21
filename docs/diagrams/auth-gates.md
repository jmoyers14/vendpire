# Auth gates

Three things can stand between the operator and the data, and they guard
different assets. Confusing them produces either a phone that shows a stranger
the whole org, or an app that is useless in a basement.

| Gate | Protects | Needs network | May hide the store |
|---|---|---|---|
| `LocalLock` | the device being in the wrong hands | no | **yes — that is its job** |
| Clerk session token | the server's data | yes | **never** |
| Update wall | the server from an incompatible build | no (once told) | **never** |

## Why the store is readable without signing in

```mermaid
flowchart TD
    Launch["cold launch, no signal"] --> Lock

    Lock{"LocalLock<br/>biometric / passcode"}
    Lock -->|"fails"| Blocked["nothing rendered"]
    Lock -->|"passes"| Store[("SwiftData store<br/>on disk")]

    Store --> Screens["locations · machines · face grid"]

    Clerk{"Clerk token"}
    Clerk -.->|"absent or expired —<br/>does NOT gate reads"| Screens
    Clerk -->|"required for"| Network["refresh · submit a visit"]
```

`Clerk.load()` is *expected* to fail on a cold offline launch. Gating the UI on
it would hide the planogram from someone standing at the machine, so the token
gates the network edge and nothing else.

That openness is what makes a local gate necessary: the store holds an entire
org's locations, machines, products and prices, sitting on disk with no
server-side check in front of it.

## Launch

```mermaid
sequenceDiagram
    participant User
    participant Gate as LocalLockGate
    participant LA as LAContext
    participant Store as SwiftData store
    participant Clerk

    User->>Gate: launch
    Gate->>LA: canEvaluatePolicy(.deviceOwnerAuthentication)

    alt no passcode enrolled on the device
        LA-->>Gate: false
        Note over Gate: unlocked — see "When there is nothing to lock"
    else enrolled
        Gate->>LA: evaluatePolicy(reason:)
        alt authenticated
            LA-->>Gate: true
            Gate->>Store: render
        else cancelled or failed
            LA-->>Gate: false
            Note over Gate: stays locked, offers retry.<br/>Never wipes, never exits.
        end
    end

    Store-->>User: screens, with no token involved
    Gate->>Clerk: refreshFromClerk() — best effort, never gates
```

`LAContext` is entirely local, so the gate works with no signal. That is the
whole reason the app gate is biometric rather than a sign-in.

## The lock's states

```mermaid
stateDiagram-v2
    [*] --> locked: cold launch
    locked --> authenticating: unlock tapped / automatic on appear
    authenticating --> unlocked: LAContext succeeds
    authenticating --> locked: cancelled, failed, or no biometry
    unlocked --> locked: foregrounded after the grace period
    unlocked --> unlocked: foregrounded within it
```

**A grace period, not an instant re-lock.** Servicing a machine means leaving
the app constantly — a camera, a phone call, a supplier's site. Re-prompting on
every return is how people turn the feature off, and a disabled lock protects
nothing. The window is a named constant, not a literal, because it is a policy
choice rather than a fact.

## When there is nothing to lock

If the device has no passcode enrolled, `canEvaluatePolicy` returns false and
the gate **opens** rather than sealing shut.

The alternative is worse in both directions: the operator is locked out of
their own field data, and the data being "protected" is already reachable by
anyone who picks the phone up, because the device itself has no lock. A gate
that only stops the legitimate user is not a security control.

Same shape as the update wall refusing to wall on a verdict it cannot
interpret — when the check itself is unavailable, failing closed harms only
the person doing their job.

## What the gate must not do

- **Never clear the store.** A failed unlock is not a sign-out; the data is
  still the operator's and still needed once they retry.
- **Never exit the app.** An app that kills itself cannot explain why.
- **Never gate on the network.** Reaching Clerk to decide whether to show a
  local screen reintroduces exactly the dependency the mirror exists to remove.
