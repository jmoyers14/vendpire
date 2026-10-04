import { beforeEach, describe, expect, it } from "bun:test";
import { JOB_TYPES } from "@vendpire/platform";
import { makeJob, makeWebhookEvent } from "@vendpire/platform/test-support";
import { SyncOrgMembershipHandler } from "./syncOrgMembership.ts";
import { PoisonJobError } from "../../PoisonJobError.ts";
import {
  eventsReturning,
  FakeOrganizationMembershipRepository,
} from "../../../test-support/fakes.ts";

const job = () =>
  makeJob({
    jobType: JOB_TYPES.SYNC_ORG_MEMBERSHIP,
    dedupKey: "clerk:msg_1",
    orgId: "org_abc",
    payload: { source: "clerk", sourceEventId: "msg_1" },
  });

/** Clerk nests both ids; the payload's own `id` is the membership's. */
const PAYLOAD = {
  id: "orgmem_abc",
  role: "org:admin",
  organization: { id: "org_abc" },
  public_user_data: { user_id: "user_abc" },
};

let memberships: FakeOrganizationMembershipRepository;

const handler = (
  type: string,
  data: unknown = PAYLOAD,
): SyncOrgMembershipHandler =>
  new SyncOrgMembershipHandler(
    eventsReturning(makeWebhookEvent({ type, payload: data })),
    memberships,
  );

beforeEach(() => {
  memberships = new FakeOrganizationMembershipRepository();
});

describe("SyncOrgMembershipHandler — create and update", () => {
  it("upserts on created, unwrapping the nested org and user ids", async () => {
    await handler("organizationMembership.created").handle(job());

    expect(memberships.upserts).toEqual([
      { orgId: "org_abc", authUserId: "user_abc", role: "org:admin" },
    ]);
    expect(memberships.softDeleted).toHaveLength(0);
  });

  it("upserts on updated, which is how a role change lands", async () => {
    await handler("organizationMembership.updated", {
      ...PAYLOAD,
      role: "org:member",
    }).handle(job());

    expect(memberships.upserts).toEqual([
      { orgId: "org_abc", authUserId: "user_abc", role: "org:member" },
    ]);
  });

  it("converges when the same event runs twice", async () => {
    const h = handler("organizationMembership.created");

    await h.handle(job());
    await h.handle(job());

    expect(memberships.upserts[0]).toEqual(memberships.upserts[1]);
  });
});

describe("SyncOrgMembershipHandler — delete", () => {
  it("soft-deletes on deleted instead of upserting", async () => {
    // The one handler that reads event.type: all three membership events share a
    // job type, so the recorded type is what distinguishes removal from sync.
    await handler("organizationMembership.deleted").handle(job());

    expect(memberships.softDeleted).toEqual([
      { orgId: "org_abc", authUserId: "user_abc" },
    ]);
    expect(memberships.upserts).toHaveLength(0);
  });

  it("is idempotent on a redelivered delete", async () => {
    const h = handler("organizationMembership.deleted");

    await h.handle(job());
    await h.handle(job());

    expect(memberships.softDeleted).toHaveLength(2);
    expect(memberships.upserts).toHaveLength(0);
  });
});

describe("SyncOrgMembershipHandler — bad input", () => {
  it("throws when the org id is not nested where Clerk puts it", async () => {
    await expect(
      handler("organizationMembership.created", {
        id: "orgmem_abc",
        role: "org:admin",
        public_user_data: { user_id: "user_abc" },
      }).handle(job()),
    ).rejects.toThrow();
  });

  it("throws when the user id is missing", async () => {
    await expect(
      handler("organizationMembership.created", {
        id: "orgmem_abc",
        role: "org:admin",
        organization: { id: "org_abc" },
        public_user_data: {},
      }).handle(job()),
    ).rejects.toThrow();
  });

  it("throws when the role is empty", async () => {
    await expect(
      handler("organizationMembership.created", { ...PAYLOAD, role: "" }).handle(
        job(),
      ),
    ).rejects.toThrow();
  });

  it("is poison when the raw event is missing", async () => {
    const orphaned = new SyncOrgMembershipHandler(
      eventsReturning(null),
      memberships,
    );

    await expect(orphaned.handle(job())).rejects.toBeInstanceOf(PoisonJobError);
    expect(memberships.upserts).toHaveLength(0);
    expect(memberships.softDeleted).toHaveLength(0);
  });
});
