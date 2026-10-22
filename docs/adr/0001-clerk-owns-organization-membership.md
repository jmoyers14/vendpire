# 1. Clerk owns organization membership

Date: 2026-10-19

## Status

Accepted

## Context

Vendpire needed a way to invite and remove teammates. The app already mirrors
Clerk into Mongo — `users`, `organizations` and `organizationmemberships` are
kept current by the `user.*`, `organization.*` and `organizationMembership.*`
webhook handlers in `packages/worker`. Given that mirror exists, the obvious
move was to build the feature on top of it: a `members` tRPC router reading
`OrganizationMembershipRepository.findByOrg`, and invite/remove mutations
calling Clerk's Backend API through a new port.

Two facts argued against that.

**An invitation is not a membership.** Clerk fires
`organizationMembership.created` only when an invite is *accepted*. Between
sending an invite and the recipient clicking the link there is no membership —
and therefore no local row, and nothing for the mirror to hold. A roster read
from `organizationmemberships` cannot show a pending invitation at all. The one
screen where someone invites a teammate is the exact screen where they then look
for them, so this is not an obscure edge case; it is the primary flow.

**The mirror lags by design.** It is fed by a webhook through Cloud Tasks. On the
screen where the user *just took the action*, that lag is visible: a removed
member lingers until the delete event lands.

Separately, Clerk's prebuilt `<OrganizationProfile />` already implements the
whole surface — roster, invitations, role changes, removal, plus the business
name and logo, which had no UI anywhere. It was in fact already reachable in
production via the `<OrganizationSwitcher />` in the header, whose
`organizationProfileMode` defaults to `'modal'`. The capability was shipped and
merely undiscoverable.

## Decision

Clerk is the source of truth for organization membership, and the web client
reads and writes it directly through `<OrganizationProfile />`. The api is not
involved in listing, inviting, or removing members.

Specifically:

- **Pending invitations are never mirrored.** No model, no webhook route, no
  sync handler. `organizationInvitation.*` stays unrouted in `eventRouting.ts`.
- **The `organizationmemberships` mirror keeps its existing job** — a read cache
  so server-side code can list or join an org's roster without a Clerk call. It
  is not what the Settings screen reads.
- **The mirror remains explicitly not an authorization source.** Roles are read
  from the session token's `orgRole`, which is always current. This restates
  what `OrganizationMembership.ts` already says; the ADR exists so the rule
  survives someone deleting the comment.
- **Admin gating is Clerk's.** There is no `orgAdminProcedure`, because there is
  no procedure to gate.

## Consequences

**Good.** The roster is always current — an invitation shows up the instant it
is sent. Roles, invitation expiry and the accept flow are Clerk's problem, not
ours. The feature cost three files instead of about twelve, and brought business
rename/logo along with it.

**Bad.** Invite and remove bypass the api entirely, so neither emits a PostHog
event and neither leaves a server-side audit trail. Nothing records who removed
whom. This is acceptable while the team is small and every admin is a founder;
it is the first thing to revisit if member management ever needs to be audited.

**Bad.** The screen wears Clerk's look, tuned through `appearance` overrides
rather than built from the design system's primitives. It is the only screen in
the app that does.

**Reversing this** means building what was skipped: a Clerk Backend API port and
adapter in `packages/platform/src/integrations/auth/`, a `MemberService`, an
`orgAdminProcedure` in `packages/api/src/trpc.ts` (note `ServiceErrorCode` has
no `FORBIDDEN` member, so it would need widening), a `members` router, and a
custom screen. `CLERK_SECRET_KEY` and `@clerk/backend` are already available to
the api process, so no configuration or deploy work would be needed.
