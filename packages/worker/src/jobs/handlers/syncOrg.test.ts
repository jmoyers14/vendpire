import { beforeEach, describe, expect, it } from "bun:test";
import { JOB_TYPES } from "@vendpire/platform";
import { makeJob, makeWebhookEvent } from "@vendpire/platform/test-support";
import { SyncOrgHandler } from "./syncOrg.ts";
import { PoisonJobError } from "../PoisonJobError.ts";
import {
  eventsReturning,
  FakeOrganizationRepository,
} from "../../test-support/fakes.ts";

const job = () =>
  makeJob({
    jobType: JOB_TYPES.SYNC_ORG,
    dedupKey: "clerk:msg_1",
    orgId: "org_abc",
    payload: { source: "clerk", sourceEventId: "msg_1" },
  });

const event = (data: unknown) =>
  makeWebhookEvent({ type: "organization.created", payload: data });

let organizations: FakeOrganizationRepository;

const handler = (data: unknown): SyncOrgHandler =>
  new SyncOrgHandler(eventsReturning(event(data)), organizations);

beforeEach(() => {
  organizations = new FakeOrganizationRepository();
});

describe("SyncOrgHandler", () => {
  it("mirrors the organization, keying it by the Clerk org id", async () => {
    // That id IS the app's tenant key — the same string every other collection
    // carries as orgId.
    await handler({
      id: "org_abc",
      name: "Moyers Vending",
      slug: "moyers-vending",
      image_url: "https://img.clerk.com/org",
    }).handle(job());

    expect(organizations.upserts).toEqual([
      {
        orgId: "org_abc",
        name: "Moyers Vending",
        slug: "moyers-vending",
        imageUrl: "https://img.clerk.com/org",
      },
    ]);
  });

  it("tolerates an org with no slug and no logo", async () => {
    await handler({ id: "org_abc", name: "Moyers Vending" }).handle(job());

    expect(organizations.upserts[0]).toEqual({
      orgId: "org_abc",
      name: "Moyers Vending",
      slug: null,
      imageUrl: null,
    });
  });

  it("converges when the same event runs twice", async () => {
    const h = handler({ id: "org_abc", name: "Moyers Vending" });

    await h.handle(job());
    await h.handle(job());

    expect(organizations.upserts[0]).toEqual(organizations.upserts[1]);
  });

  it("throws on a payload with no org id", async () => {
    await expect(
      handler({ name: "Moyers Vending" }).handle(job()),
    ).rejects.toThrow();
  });

  it("is poison when the raw event is missing", async () => {
    const orphaned = new SyncOrgHandler(eventsReturning(null), organizations);

    await expect(orphaned.handle(job())).rejects.toBeInstanceOf(PoisonJobError);
    expect(organizations.upserts).toHaveLength(0);
  });
});
