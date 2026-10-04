import { beforeEach, describe, expect, it } from "bun:test";
import { JOB_TYPES } from "@vendpire/platform";
import { makeJob, makeWebhookEvent } from "@vendpire/platform/test-support";
import { SyncUserHandler } from "./syncUser.ts";
import { PoisonJobError } from "../PoisonJobError.ts";
import {
  eventsReturning,
  FakeUserRepository,
} from "../../test-support/fakes.ts";

/** The job the runner hands the handler: a pointer to the recorded event. */
const job = () =>
  makeJob({
    jobType: JOB_TYPES.SYNC_USER,
    dedupKey: "clerk:msg_1",
    payload: { source: "clerk", sourceEventId: "msg_1" },
  });

const event = (data: unknown) =>
  makeWebhookEvent({ type: "user.created", payload: data });

let users: FakeUserRepository;

const handler = (data: unknown): SyncUserHandler =>
  new SyncUserHandler(eventsReturning(event(data)), users);

beforeEach(() => {
  users = new FakeUserRepository();
});

describe("SyncUserHandler", () => {
  it("mirrors the user, resolving the primary email by its id", async () => {
    // Clerk flags the primary address by id in a separate field rather than
    // inline, so the pointer has to be followed.
    await handler({
      id: "user_abc",
      first_name: "Jeremy",
      last_name: "Moyers",
      image_url: "https://img.clerk.com/abc",
      primary_email_address_id: "idn_2",
      email_addresses: [
        { id: "idn_1", email_address: "old@example.com" },
        { id: "idn_2", email_address: "jeremy@example.com" },
      ],
    }).handle(job());

    expect(users.upserts).toEqual([
      {
        authUserId: "user_abc",
        email: "jeremy@example.com",
        firstName: "Jeremy",
        lastName: "Moyers",
        imageUrl: "https://img.clerk.com/abc",
      },
    ]);
  });

  it("falls back to the first address when Clerk marked no primary", async () => {
    await handler({
      id: "user_abc",
      primary_email_address_id: null,
      email_addresses: [{ id: "idn_1", email_address: "first@example.com" }],
    }).handle(job());

    expect(users.upserts[0]?.email).toBe("first@example.com");
  });

  it("falls back to the first address when the primary id points at nothing", async () => {
    await handler({
      id: "user_abc",
      primary_email_address_id: "idn_gone",
      email_addresses: [{ id: "idn_1", email_address: "first@example.com" }],
    }).handle(job());

    expect(users.upserts[0]?.email).toBe("first@example.com");
  });

  it("tolerates a user with no name, no avatar and no email", async () => {
    // A brand-new Clerk user genuinely looks like this.
    await handler({ id: "user_abc" }).handle(job());

    expect(users.upserts).toEqual([
      {
        authUserId: "user_abc",
        email: null,
        firstName: null,
        lastName: null,
        imageUrl: null,
      },
    ]);
  });

  it("converges when the same event runs twice", async () => {
    const h = handler({
      id: "user_abc",
      primary_email_address_id: "idn_1",
      email_addresses: [{ id: "idn_1", email_address: "jeremy@example.com" }],
    });

    await h.handle(job());
    await h.handle(job());

    // Two upserts of the SAME desired state — which is what at-least-once
    // delivery demands. The repository's unique key collapses them to one row.
    expect(users.upserts).toHaveLength(2);
    expect(users.upserts[0]).toEqual(users.upserts[1]);
  });

  it("throws on a payload with no user id, so the runner records a failure", async () => {
    await expect(handler({ first_name: "Jeremy" }).handle(job())).rejects.toThrow();
  });

  it("is poison when the raw event is missing, since that absence is permanent", async () => {
    const orphaned = new SyncUserHandler(eventsReturning(null), users);

    await expect(orphaned.handle(job())).rejects.toBeInstanceOf(PoisonJobError);
    expect(users.upserts).toHaveLength(0);
  });

  it("throws on a job payload that isn't an event pointer", async () => {
    await expect(
      handler({ id: "user_abc" }).handle(makeJob({ payload: { nope: true } })),
    ).rejects.toThrow();
  });
});
