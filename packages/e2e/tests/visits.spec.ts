import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect, requireTestUser } from "../fixtures.ts";

/**
 * The claim the offline story rests on: a retried submit must return the FIRST
 * visit, not create a second one. The repository test proves the unique index
 * and the service test proves the re-read path; only this one proves the two
 * HTTP requests a phone actually sends come back as one document.
 *
 * Needs a real Clerk session — every visit procedure is `orgProtectedProcedure`.
 */
requireTestUser();

/** tRPC's standalone adapter, unbatched: POST the input as the whole body. */
const mutate = (
  apiUrl: string,
  token: string,
  path: string,
  input: unknown,
): Promise<Response> =>
  fetch(`${apiUrl}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

/** A query with no input must send no `input` param at all, not "undefined". */
const query = (
  apiUrl: string,
  token: string,
  path: string,
  input?: unknown,
): Promise<Response> => {
  const search =
    input === undefined
      ? ""
      : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return fetch(`${apiUrl}/${path}${search}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

const dataOf = async <T>(response: Response): Promise<T> => {
  const body = (await response.json()) as {
    result?: { data?: T };
    error?: { message?: string };
  };
  if (!response.ok || !body.result) {
    throw new Error(
      `${response.status} ${body.error?.message ?? "no result in response"}`,
    );
  }
  return body.result.data as T;
};

test("a repeated submit of one draft stores exactly one visit", async ({
  page,
  apiStack,
}) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.loaded({ page });
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER_EMAIL!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    },
  });

  // `globalThis` rather than `window`: this closure is serialized into the page,
  // but it is TYPE-CHECKED here, where the DOM lib is not loaded.
  const token = await page.evaluate(async () => {
    const clerkGlobal = (
      globalThis as unknown as {
        Clerk?: { session?: { getToken(): Promise<string | null> } };
      }
    ).Clerk;
    return (await clerkGlobal?.session?.getToken()) ?? null;
  });
  expect(token).toBeTruthy();

  // Every data procedure needs an org claim. A fresh test user has no business
  // yet, and creating one here would leave a tenant behind in a shared Clerk
  // instance — so skip rather than fabricate.
  const probe = await query(apiStack.apiUrl, token!, "machines.list");
  test.skip(
    probe.status === 403,
    "The E2E Clerk user needs an active organization",
  );

  const location = await dataOf<{ id: string }>(
    await mutate(apiStack.apiUrl, token!, "locations.create", {
      name: `E2E idempotency ${Date.now()}`,
      address: { line1: null, city: null, state: null, zip: null, geo: null },
      contact: { name: null, phone: null, email: null },
      commission: { type: "none" },
    }),
  );
  const machine = await dataOf<{ id: string }>(
    await mutate(apiStack.apiUrl, token!, "machines.create", {
      locationId: location.id,
      name: "E2E snack machine",
      kind: "snack",
      slots: [["A1"]],
    }),
  );
  const product = await dataOf<{ id: string }>(
    await mutate(apiStack.apiUrl, token!, "products.create", {
      name: "E2E Coke 12oz",
      category: "drinks",
      defaultPriceCents: 175,
    }),
  );

  const draft = {
    machineId: machine.id,
    locationId: location.id,
    countedAt: new Date().toISOString(),
    lines: [
      {
        slotCode: "A1",
        productId: product.id,
        remaining: 4,
        added: 6,
        priceCents: 175,
        par: 10,
      },
    ],
    // One key per draft, stable across retries. The whole point.
    clientRequestId: `e2e-${crypto.randomUUID()}`,
  };

  const first = await dataOf<{ id: string }>(
    await mutate(apiStack.apiUrl, token!, "visits.create", draft),
  );

  // The retry. Byte-identical, as an outbox would resend it.
  const retry = await mutate(apiStack.apiUrl, token!, "visits.create", draft);
  // 200 with the original, never a 409: a client cannot act on a conflict, so it
  // would either drop the day's counts or retry forever.
  expect(retry.status).toBe(200);
  const second = await dataOf<{ id: string }>(retry);

  expect(second.id).toBe(first.id);

  const stored = await dataOf<{ id: string }[]>(
    await query(apiStack.apiUrl, token!, "visits.list", {
      machineId: machine.id,
    }),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0]?.id).toBe(first.id);

  // No cleanup: this worker's stack runs on its own in-memory MongoDB, which
  // goes away with the worker. Only the Clerk organization is shared, and
  // nothing here touches it.
});
