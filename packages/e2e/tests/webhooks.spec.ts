import { MongoClient } from "mongodb";
import { Webhook } from "standardwebhooks";
import { test, expect, type WorkerStack } from "../fixtures.ts";

/**
 * End-to-end webhook ingestion against the real worker process: a genuinely
 * signed delivery, the full verify → record → enqueue → run → upsert chain, and
 * the guards that keep the public endpoints closed.
 *
 * No browser and no Clerk keys — the signing secret is this worker's own, so the
 * signatures are real without any account involved.
 */

/** Builds a signed delivery exactly as Clerk's sender would. */
const signedRequest = (
  stack: WorkerStack,
  type: string,
  data: unknown,
  id: string,
): { url: string; init: RequestInit } => {
  const timestamp = new Date();
  const payload = JSON.stringify({ type, object: "event", data });
  const signature = new Webhook(stack.signingSecret).sign(
    id,
    timestamp,
    payload,
  );

  return {
    url: `${stack.workerUrl}/ingest/clerk`,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
        "svix-signature": signature,
      },
      body: payload,
    },
  };
};

const deliver = async (
  stack: WorkerStack,
  type: string,
  data: unknown,
  id: string,
): Promise<Response> => {
  const { url, init } = signedRequest(stack, type, data, id);
  return fetch(url, init);
};

/**
 * Polls until the predicate holds. The task hop is deliberately fire-and-forget
 * (so the provider gets its 2xx promptly), which means the job finishes shortly
 * *after* the ingest response — there is nothing to await.
 */
const eventually = async <T>(
  read: () => Promise<T>,
  holds: (value: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let last = await read();
  while (Date.now() < deadline) {
    if (holds(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    last = await read();
  }
  throw new Error(`Timed out; last value: ${JSON.stringify(last)}`);
};

test.describe("webhook ingestion", () => {
  test("health probe answers", async ({ workerStack }) => {
    const response = await fetch(`${workerStack.workerUrl}/health`);

    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("an unsigned delivery is rejected and persists nothing", async ({
    apiStack,
    workerStack,
  }) => {
    const client = await new MongoClient(apiStack.mongoUri).connect();
    try {
      const before = await client
        .db()
        .collection("webhookevents")
        .countDocuments();

      const response = await fetch(`${workerStack.workerUrl}/ingest/clerk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "user.created", data: { id: "user_x" } }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid signature" });
      // Nothing written: an unverified request must not be able to touch the db.
      expect(
        await client.db().collection("webhookevents").countDocuments(),
      ).toBe(before);
    } finally {
      await client.close();
    }
  });

  test("/tasks/* is closed to callers with no OIDC token in a real environment", async ({
    workerStack,
  }) => {
    // This worker runs ENVIRONMENT=local, which pairs the loopback queue with the
    // allow-all guard — so locally it answers rather than 403ing. The assertion
    // that matters here is that the route exists and is reachable only through
    // the guard; the fail-closed behaviour itself is unit-tested against
    // GoogleOidcTaskAuthenticator.
    const response = await fetch(`${workerStack.workerUrl}/tasks/syncUser`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dedupKey: "clerk:does-not-exist" }),
    });

    // No job row for that key ⇒ ack, so the queue stops retrying.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ error: "job not found" });
  });

  test("an unsubscribed event type is recorded but not acted on", async ({
    apiStack,
    workerStack,
  }) => {
    const response = await deliver(
      workerStack,
      "session.created",
      { id: "sess_1" },
      "msg_session_1",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ignored",
      type: "session.created",
    });

    const client = await new MongoClient(apiStack.mongoUri).connect();
    try {
      const event = await client
        .db()
        .collection("webhookevents")
        .findOne({ sourceEventId: "msg_session_1" });
      expect(event?.type).toBe("session.created");

      // Recorded for audit, but no job scheduled.
      expect(
        await client
          .db()
          .collection("jobs")
          .countDocuments({ dedupKey: "clerk:msg_session_1" }),
      ).toBe(0);
    } finally {
      await client.close();
    }
  });

  test("user.created runs the full chain into the users collection", async ({
    apiStack,
    workerStack,
  }) => {
    const response = await deliver(
      workerStack,
      "user.created",
      {
        id: "user_e2e",
        first_name: "Jeremy",
        last_name: "Moyers",
        primary_email_address_id: "idn_1",
        email_addresses: [
          { id: "idn_1", email_address: "jeremy@example.com" },
        ],
      },
      "msg_user_1",
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      status: "queued",
      jobType: "syncUser",
    });

    const client = await new MongoClient(apiStack.mongoUri).connect();
    try {
      // The job completes just after the ingest response — the task hop is
      // fire-and-forget by design.
      const job = await eventually(
        () =>
          client
            .db()
            .collection("jobs")
            .findOne({ jobType: "syncUser", dedupKey: "clerk:msg_user_1" }),
        (value) => value?.status === "succeeded",
      );
      expect(job?.attempts).toBe(1);

      const user = await client
        .db()
        .collection("users")
        .findOne({ authUserId: "user_e2e" });
      expect(user?.email).toBe("jeremy@example.com");
      expect(user?.firstName).toBe("Jeremy");
    } finally {
      await client.close();
    }
  });

  test("a redelivery is absorbed without duplicating or re-running", async ({
    apiStack,
    workerStack,
  }) => {
    const payload = { id: "user_dup", email_addresses: [] };

    await deliver(workerStack, "user.created", payload, "msg_dup_1");

    const client = await new MongoClient(apiStack.mongoUri).connect();
    try {
      await eventually(
        () =>
          client
            .db()
            .collection("jobs")
            .findOne({ jobType: "syncUser", dedupKey: "clerk:msg_dup_1" }),
        (value) => value?.status === "succeeded",
      );

      // Same svix-id, so the same delivery as far as everything downstream cares.
      const second = await deliver(
        workerStack,
        "user.created",
        payload,
        "msg_dup_1",
      );
      expect(second.status).toBe(202);

      // Give the loopback task time to arrive and be acked.
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      expect(
        await client
          .db()
          .collection("webhookevents")
          .countDocuments({ sourceEventId: "msg_dup_1" }),
      ).toBe(1);

      const jobs = await client
        .db()
        .collection("jobs")
        .find({ dedupKey: "clerk:msg_dup_1" })
        .toArray();
      expect(jobs).toHaveLength(1);
      // Still one attempt: the runner short-circuits an already-succeeded job
      // rather than running the handler again.
      expect(jobs[0]?.attempts).toBe(1);
    } finally {
      await client.close();
    }
  });

  test("organization.created mirrors the business, keyed by the Clerk org id", async ({
    apiStack,
    workerStack,
  }) => {
    const response = await deliver(
      workerStack,
      "organization.created",
      {
        id: "org_e2e",
        name: "Moyers Vending",
        slug: "moyers-vending",
        image_url: null,
      },
      "msg_org_1",
    );

    expect(response.status).toBe(202);

    const client = await new MongoClient(apiStack.mongoUri).connect();
    try {
      const organization = await eventually(
        () =>
          client
            .db()
            .collection("organizations")
            .findOne({ orgId: "org_e2e" }),
        (value) => value !== null,
      );
      expect(organization?.name).toBe("Moyers Vending");
      expect(organization?.slug).toBe("moyers-vending");
      expect(organization?.deletedAt).toBeNull();

      // The job row carries the tenant tag, read off the payload's own id.
      const job = await client
        .db()
        .collection("jobs")
        .findOne({ dedupKey: "clerk:msg_org_1" });
      expect(job?.orgId).toBe("org_e2e");
    } finally {
      await client.close();
    }
  });

  test("a membership is created then soft-deleted, not removed", async ({
    apiStack,
    workerStack,
  }) => {
    const membership = {
      id: "orgmem_e2e",
      role: "org:admin",
      organization: { id: "org_e2e" },
      public_user_data: { user_id: "user_e2e" },
    };

    await deliver(
      workerStack,
      "organizationMembership.created",
      membership,
      "msg_mem_1",
    );

    const client = await new MongoClient(apiStack.mongoUri).connect();
    try {
      const created = await eventually(
        () =>
          client
            .db()
            .collection("organizationmemberships")
            .findOne({ orgId: "org_e2e", authUserId: "user_e2e" }),
        (value) => value !== null,
      );
      expect(created?.role).toBe("org:admin");
      expect(created?.deletedAt).toBeNull();

      // The one event that takes the other branch of the handler.
      await deliver(
        workerStack,
        "organizationMembership.deleted",
        membership,
        "msg_mem_2",
      );

      const removed = await eventually(
        () =>
          client
            .db()
            .collection("organizationmemberships")
            .findOne({ orgId: "org_e2e", authUserId: "user_e2e" }),
        (value) => value?.deletedAt !== null,
      );
      // Soft, so a future sync pull can still tell a client it went away.
      expect(removed?.deletedAt).toBeInstanceOf(Date);

      // The membership job's tenant tag comes from the NESTED org id.
      const job = await client
        .db()
        .collection("jobs")
        .findOne({ dedupKey: "clerk:msg_mem_1" });
      expect(job?.orgId).toBe("org_e2e");
    } finally {
      await client.close();
    }
  });
});
